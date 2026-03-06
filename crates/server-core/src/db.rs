use sqlx::{AnyPool, FromRow, Row};
use uuid::Uuid;

use crate::{
    BillingState, ChallengeRecord, PersistedOp, SessionRecord, default_entitlement_from_policy,
    load_admin_billing_policy, now_ms, revision_from_ops,
};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn init_database(pool: &AnyPool) -> Result<(), sqlx::migrate::MigrateError> {
    MIGRATOR.run(pool).await
}

pub async fn create_challenge(
    pool: &AnyPool,
    public_key_hint: &str,
) -> Result<ChallengeRecord, sqlx::Error> {
    let record = ChallengeRecord {
        nonce: Uuid::new_v4().to_string(),
        public_key_hint: public_key_hint.to_string(),
        expires_at_ms: now_ms() + 5 * 60 * 1000,
        created_at_ms: now_ms(),
    };

    sqlx::query(
        "INSERT INTO challenges (nonce, public_key_hint, expires_at_ms, created_at_ms) VALUES (?, ?, ?, ?)",
    )
    .bind(&record.nonce)
    .bind(&record.public_key_hint)
    .bind(record.expires_at_ms)
    .bind(record.created_at_ms)
    .execute(pool)
    .await?;

    Ok(record)
}

pub async fn take_challenge(
    pool: &AnyPool,
    nonce: &str,
) -> Result<Option<ChallengeRecord>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let record = sqlx::query_as::<_, ChallengeRecord>(
        "SELECT nonce, public_key_hint, expires_at_ms, created_at_ms FROM challenges WHERE nonce = ?",
    )
    .bind(nonce)
    .fetch_optional(&mut *tx)
    .await?;

    if record.is_some() {
        sqlx::query("DELETE FROM challenges WHERE nonce = ?")
            .bind(nonce)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(record)
}

pub async fn create_session(
    pool: &AnyPool,
    public_key_hex: &str,
) -> Result<SessionRecord, sqlx::Error> {
    let entitlement = ensure_billing_account(pool, public_key_hex).await?;
    let token = Uuid::new_v4().to_string();
    let vault_id = public_key_hex.to_string();
    let expires_at_ms = now_ms() + 24 * 60 * 60 * 1000;

    sqlx::query(
        "INSERT INTO sessions (token, public_key_hex, vault_id, expires_at_ms, plan, status, write_enabled_until_ms, archive_until_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&token)
    .bind(public_key_hex)
    .bind(&vault_id)
    .bind(expires_at_ms)
    .bind(&entitlement.plan)
    .bind(&entitlement.status)
    .bind(entitlement.write_enabled_until_ms)
    .bind(entitlement.archive_until_ms)
    .execute(pool)
    .await?;

    sqlx::query("INSERT INTO vaults (vault_id, public_key_hex, revision, updated_at_ms) VALUES (?, ?, ?, ?) ON CONFLICT(vault_id) DO NOTHING")
        .bind(&vault_id)
        .bind(public_key_hex)
        .bind("0:0")
        .bind(now_ms())
        .execute(pool)
        .await?;

    Ok(SessionRecord {
        token,
        public_key_hex: public_key_hex.to_string(),
        vault_id,
        expires_at_ms,
        plan: entitlement.plan,
        status: entitlement.status,
        write_enabled_until_ms: entitlement.write_enabled_until_ms,
        archive_until_ms: entitlement.archive_until_ms,
    })
}

pub async fn get_session(
    pool: &AnyPool,
    token: &str,
) -> Result<Option<SessionRecord>, sqlx::Error> {
    sqlx::query_as::<_, SessionRecord>(
        "SELECT token, public_key_hex, vault_id, expires_at_ms, plan, status, write_enabled_until_ms, archive_until_ms FROM sessions WHERE token = ?",
    )
    .bind(token)
    .fetch_optional(pool)
    .await
}

pub async fn fetch_ops(pool: &AnyPool, vault_id: &str) -> Result<Vec<PersistedOp>, sqlx::Error> {
    sqlx::query_as::<_, PersistedOp>(
        "SELECT op_id, vault_id, entity_id, kind, wall_ms, hlc_counter, node_id, cipher_b64, aad_b64, hash_hex, CAST(deleted AS INTEGER) AS deleted, created_at_ms FROM vault_ops WHERE vault_id = ? ORDER BY wall_ms, hlc_counter, node_id, op_id",
    )
    .bind(vault_id)
    .fetch_all(pool)
    .await
}

pub async fn store_ops(
    pool: &AnyPool,
    vault_id: &str,
    ops: &[PersistedOp],
) -> Result<String, sqlx::Error> {
    let mut tx = pool.begin().await?;
    for op in ops {
        sqlx::query(
            "INSERT INTO vault_ops (op_id, vault_id, entity_id, kind, wall_ms, hlc_counter, node_id, cipher_b64, aad_b64, hash_hex, deleted, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(op_id) DO NOTHING",
        )
        .bind(&op.op_id)
        .bind(vault_id)
        .bind(&op.entity_id)
        .bind(&op.kind)
        .bind(op.wall_ms)
        .bind(op.hlc_counter)
        .bind(&op.node_id)
        .bind(&op.cipher_b64)
        .bind(&op.aad_b64)
        .bind(&op.hash_hex)
        .bind(op.deleted)
        .bind(op.created_at_ms)
        .execute(&mut *tx)
        .await?;
    }

    let stored_ops = sqlx::query_as::<_, PersistedOp>(
        "SELECT op_id, vault_id, entity_id, kind, wall_ms, hlc_counter, node_id, cipher_b64, aad_b64, hash_hex, CAST(deleted AS INTEGER) AS deleted, created_at_ms FROM vault_ops WHERE vault_id = ? ORDER BY wall_ms, hlc_counter, node_id, op_id",
    )
    .bind(vault_id)
    .fetch_all(&mut *tx)
    .await?;
    let revision = revision_from_ops(&stored_ops);

    sqlx::query(
        "INSERT INTO vaults (vault_id, public_key_hex, revision, updated_at_ms) VALUES (?, ?, ?, ?) ON CONFLICT(vault_id) DO UPDATE SET revision = excluded.revision, updated_at_ms = excluded.updated_at_ms",
    )
    .bind(vault_id)
    .bind(vault_id)
    .bind(&revision)
    .bind(now_ms())
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO audit_logs (id, action, subject, created_at_ms) VALUES (?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind("store_ops")
        .bind(vault_id)
        .bind(now_ms())
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(revision)
}

pub async fn current_revision(pool: &AnyPool, vault_id: &str) -> Result<String, sqlx::Error> {
    let revision = sqlx::query("SELECT revision FROM vaults WHERE vault_id = ?")
        .bind(vault_id)
        .fetch_optional(pool)
        .await?
        .and_then(|row| row.try_get::<String, _>("revision").ok())
        .unwrap_or_else(|| "0:0".to_string());
    Ok(revision)
}

async fn ensure_billing_account(
    pool: &AnyPool,
    public_key_hex: &str,
) -> Result<BillingState, sqlx::Error> {
    let existing = sqlx::query(
        "SELECT plan, status, write_enabled_until_ms, archive_until_ms FROM billing_accounts WHERE public_key_hex = ?",
    )
    .bind(public_key_hex)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = existing {
        return Ok(BillingState {
            plan: row.try_get("plan")?,
            status: row.try_get("status")?,
            write_enabled_until_ms: row.try_get("write_enabled_until_ms")?,
            archive_until_ms: row.try_get("archive_until_ms")?,
        });
    }

    let policy = load_admin_billing_policy(pool).await?;
    let default = default_entitlement_from_policy(&policy);
    sqlx::query(
        "INSERT INTO billing_accounts (public_key_hex, plan, status, write_enabled_until_ms, archive_until_ms) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(public_key_hex)
    .bind(&default.plan)
    .bind(&default.status)
    .bind(default.write_enabled_until_ms)
    .bind(default.archive_until_ms)
    .execute(pool)
    .await?;

    Ok(default)
}

impl<'r> FromRow<'r, sqlx::any::AnyRow> for ChallengeRecord {
    fn from_row(row: &sqlx::any::AnyRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            nonce: row.try_get("nonce")?,
            public_key_hint: row.try_get("public_key_hint")?,
            expires_at_ms: row.try_get("expires_at_ms")?,
            created_at_ms: row.try_get("created_at_ms")?,
        })
    }
}

impl<'r> FromRow<'r, sqlx::any::AnyRow> for SessionRecord {
    fn from_row(row: &sqlx::any::AnyRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            token: row.try_get("token")?,
            public_key_hex: row.try_get("public_key_hex")?,
            vault_id: row.try_get("vault_id")?,
            expires_at_ms: row.try_get("expires_at_ms")?,
            plan: row.try_get("plan")?,
            status: row.try_get("status")?,
            write_enabled_until_ms: row.try_get("write_enabled_until_ms")?,
            archive_until_ms: row.try_get("archive_until_ms")?,
        })
    }
}

impl<'r> FromRow<'r, sqlx::any::AnyRow> for PersistedOp {
    fn from_row(row: &sqlx::any::AnyRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            op_id: row.try_get("op_id")?,
            vault_id: row.try_get("vault_id")?,
            entity_id: row.try_get("entity_id")?,
            kind: row.try_get("kind")?,
            wall_ms: row.try_get("wall_ms")?,
            hlc_counter: row.try_get("hlc_counter")?,
            node_id: row.try_get("node_id")?,
            cipher_b64: row.try_get("cipher_b64")?,
            aad_b64: row.try_get("aad_b64")?,
            hash_hex: row.try_get("hash_hex")?,
            deleted: decode_bool(row, "deleted")?,
            created_at_ms: row.try_get("created_at_ms")?,
        })
    }
}

fn decode_bool(row: &sqlx::any::AnyRow, column: &str) -> Result<bool, sqlx::Error> {
    if let Ok(value) = row.try_get::<bool, _>(column) {
        return Ok(value);
    }
    if let Ok(value) = row.try_get::<i64, _>(column) {
        return Ok(value != 0);
    }
    let value = row.try_get::<String, _>(column)?;
    Ok(matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "t" | "yes"
    ))
}

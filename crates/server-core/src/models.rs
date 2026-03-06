use std::{fmt, str::FromStr, sync::Arc};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use gaubee_2fa_sync_core::{Hlc, SyncOp, SyncOpKind};
use serde::{Deserialize, Serialize};
use sqlx::AnyPool;
use thiserror::Error;
use tokio::sync::broadcast;

use crate::proto;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseKind {
    Sqlite,
    Postgres,
}

impl FromStr for DatabaseKind {
    type Err = ParseDatabaseKindError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "sqlite" => Ok(Self::Sqlite),
            "postgres" | "postgresql" => Ok(Self::Postgres),
            _ => Err(ParseDatabaseKindError),
        }
    }
}

#[derive(Debug, Error)]
#[error("unsupported database kind")]
pub struct ParseDatabaseKindError;

impl fmt::Display for DatabaseKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sqlite => formatter.write_str("sqlite"),
            Self::Postgres => formatter.write_str("postgres"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppState {
    pub pool: AnyPool,
    pub events: broadcast::Sender<SyncEvent>,
    pub database_kind: DatabaseKind,
    pub admin_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeRecord {
    pub nonce: String,
    pub public_key_hint: String,
    pub expires_at_ms: i64,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingState {
    pub plan: String,
    pub status: String,
    pub write_enabled_until_ms: i64,
    pub archive_until_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub token: String,
    pub public_key_hex: String,
    pub vault_id: String,
    pub expires_at_ms: i64,
    pub plan: String,
    pub status: String,
    pub write_enabled_until_ms: i64,
    pub archive_until_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedOp {
    pub op_id: String,
    pub vault_id: String,
    pub entity_id: String,
    pub kind: String,
    pub wall_ms: i64,
    pub hlc_counter: i64,
    pub node_id: String,
    pub cipher_b64: String,
    pub aad_b64: String,
    pub hash_hex: String,
    pub deleted: bool,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct SyncEvent {
    pub vault_id: String,
    pub revision: String,
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub fn default_entitlement() -> BillingState {
    let now = now_ms();
    BillingState {
        plan: "self-provider".to_string(),
        status: "ACTIVE".to_string(),
        write_enabled_until_ms: now + 365 * 24 * 60 * 60 * 1000,
        archive_until_ms: now + 730 * 24 * 60 * 60 * 1000,
    }
}

pub fn proto_entitlement(entitlement: &BillingState) -> proto::Entitlement {
    proto::Entitlement {
        plan: entitlement.plan.clone(),
        status: entitlement.status.clone(),
        write_enabled_until_ms: entitlement.write_enabled_until_ms,
        archive_until_ms: entitlement.archive_until_ms,
    }
}

pub fn revision_from_ops(ops: &[PersistedOp]) -> String {
    let last = ops
        .iter()
        .map(|op| op.created_at_ms)
        .max()
        .unwrap_or_default();
    format!("{last}:{}", ops.len())
}

pub fn sync_op_to_proto(op: &PersistedOp) -> proto::SyncOp {
    proto::SyncOp {
        op_id: op.op_id.clone(),
        entity_id: op.entity_id.clone(),
        kind: op.kind.clone(),
        hlc: Some(proto::Hlc {
            wall_ms: op.wall_ms,
            counter: op.hlc_counter as u32,
            node_id: op.node_id.clone(),
        }),
        cipher: BASE64.decode(op.cipher_b64.as_bytes()).unwrap_or_default(),
        aad: BASE64.decode(op.aad_b64.as_bytes()).unwrap_or_default(),
        hash_hex: op.hash_hex.clone(),
        deleted: op.deleted,
    }
}

pub fn proto_to_persisted_op(vault_id: &str, op: proto::SyncOp) -> PersistedOp {
    let hlc = op.hlc.unwrap_or(proto::Hlc {
        wall_ms: 0,
        counter: 0,
        node_id: String::new(),
    });
    PersistedOp {
        op_id: op.op_id,
        vault_id: vault_id.to_string(),
        entity_id: op.entity_id,
        kind: op.kind,
        wall_ms: hlc.wall_ms,
        hlc_counter: i64::from(hlc.counter),
        node_id: hlc.node_id,
        cipher_b64: BASE64.encode(&op.cipher),
        aad_b64: BASE64.encode(&op.aad),
        hash_hex: op.hash_hex,
        deleted: op.deleted,
        created_at_ms: now_ms(),
    }
}

impl From<&PersistedOp> for SyncOp {
    fn from(value: &PersistedOp) -> Self {
        Self {
            op_id: value.op_id.clone(),
            entity_id: value.entity_id.clone(),
            kind: if value.deleted {
                SyncOpKind::DeleteEntry
            } else {
                SyncOpKind::UpsertEntry
            },
            hlc: Hlc {
                wall_ms: value.wall_ms,
                counter: value.hlc_counter as u32,
                node_id: value.node_id.clone(),
            },
            cipher: BASE64
                .decode(value.cipher_b64.as_bytes())
                .unwrap_or_default(),
            aad: BASE64.decode(value.aad_b64.as_bytes()).unwrap_or_default(),
            hash_hex: value.hash_hex.clone(),
            deleted: value.deleted,
        }
    }
}

impl AppState {
    pub fn shared(self) -> Arc<Self> {
        Arc::new(self)
    }
}

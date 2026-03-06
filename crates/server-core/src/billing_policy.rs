use serde::{Deserialize, Serialize};
use sqlx::{AnyPool, Row};
use uuid::Uuid;

use crate::{BillingState, now_ms};

const BILLING_POLICY_ROW_ID: i64 = 1;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVE_DAYS: i64 = 365;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBillingPolicy {
    pub cloud_1k_annual_usd: i64,
    pub cloud_1k_annual_cny: i64,
    pub grace_days: i64,
    pub readonly_days: i64,
}

pub fn default_admin_billing_policy() -> AdminBillingPolicy {
    AdminBillingPolicy {
        cloud_1k_annual_usd: 1,
        cloud_1k_annual_cny: 7,
        grace_days: 30,
        readonly_days: 365,
    }
}

pub fn default_entitlement_from_policy(policy: &AdminBillingPolicy) -> BillingState {
    let now = now_ms();
    let write_days = DEFAULT_ACTIVE_DAYS + policy.grace_days;
    let archive_days = write_days + policy.readonly_days;
    BillingState {
        plan: "self-provider".to_string(),
        status: "ACTIVE".to_string(),
        write_enabled_until_ms: now + write_days * DAY_MS,
        archive_until_ms: now + archive_days * DAY_MS,
    }
}

pub async fn load_admin_billing_policy(pool: &AnyPool) -> Result<AdminBillingPolicy, sqlx::Error> {
    let existing = sqlx::query(
        "SELECT cloud_1k_annual_usd, cloud_1k_annual_cny, grace_days, readonly_days FROM admin_billing_policy WHERE id = ?",
    )
    .bind(BILLING_POLICY_ROW_ID)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = existing {
        return Ok(AdminBillingPolicy {
            cloud_1k_annual_usd: row.try_get("cloud_1k_annual_usd")?,
            cloud_1k_annual_cny: row.try_get("cloud_1k_annual_cny")?,
            grace_days: row.try_get("grace_days")?,
            readonly_days: row.try_get("readonly_days")?,
        });
    }

    let policy = default_admin_billing_policy();
    sqlx::query(
        "INSERT INTO admin_billing_policy (id, cloud_1k_annual_usd, cloud_1k_annual_cny, grace_days, readonly_days, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(BILLING_POLICY_ROW_ID)
    .bind(policy.cloud_1k_annual_usd)
    .bind(policy.cloud_1k_annual_cny)
    .bind(policy.grace_days)
    .bind(policy.readonly_days)
    .bind(now_ms())
    .execute(pool)
    .await?;

    Ok(policy)
}

pub async fn store_admin_billing_policy(
    pool: &AnyPool,
    policy: &AdminBillingPolicy,
) -> Result<(), sqlx::Error> {
    let updated_at_ms = now_ms();
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO admin_billing_policy (id, cloud_1k_annual_usd, cloud_1k_annual_cny, grace_days, readonly_days, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET cloud_1k_annual_usd = excluded.cloud_1k_annual_usd, cloud_1k_annual_cny = excluded.cloud_1k_annual_cny, grace_days = excluded.grace_days, readonly_days = excluded.readonly_days, updated_at_ms = excluded.updated_at_ms",
    )
    .bind(BILLING_POLICY_ROW_ID)
    .bind(policy.cloud_1k_annual_usd)
    .bind(policy.cloud_1k_annual_cny)
    .bind(policy.grace_days)
    .bind(policy.readonly_days)
    .bind(updated_at_ms)
    .execute(&mut *tx)
    .await?;

    sqlx::query("INSERT INTO audit_logs (id, action, subject, created_at_ms) VALUES (?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind("update_billing_policy")
        .bind("admin")
        .bind(updated_at_ms)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{AdminBillingPolicy, DAY_MS, DEFAULT_ACTIVE_DAYS, default_entitlement_from_policy};

    #[test]
    fn policy_windows_extend_default_entitlement() {
        let policy = AdminBillingPolicy {
            cloud_1k_annual_usd: 1,
            cloud_1k_annual_cny: 7,
            grace_days: 10,
            readonly_days: 40,
        };
        let now = crate::now_ms();
        let entitlement = default_entitlement_from_policy(&policy);
        assert_eq!(entitlement.plan, "self-provider");
        assert_eq!(entitlement.status, "ACTIVE");
        let min_write_delta = (DEFAULT_ACTIVE_DAYS + policy.grace_days) * DAY_MS;
        let min_archive_delta =
            (DEFAULT_ACTIVE_DAYS + policy.grace_days + policy.readonly_days) * DAY_MS;
        assert!(entitlement.write_enabled_until_ms - now >= min_write_delta - 1_000);
        assert!(entitlement.archive_until_ms - now >= min_archive_delta - 1_000);
    }
}

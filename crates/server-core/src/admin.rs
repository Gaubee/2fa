use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{AnyPool, Row};

use crate::{AdminBillingPolicy, DatabaseKind, load_admin_billing_policy, now_ms};

const DAY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminOverviewResponse {
    pub generated_at_ms: i64,
    pub database_kind: String,
    pub active_vaults_24h: i64,
    pub paid_accounts: i64,
    pub active_sessions: i64,
    pub recent_ops_24h: i64,
    pub topology: Vec<AdminTopologyNode>,
    pub checklist: Vec<AdminChecklistItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminTopologyNode {
    pub name: String,
    pub role: String,
    pub status: String,
    pub region: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminChecklistItem {
    pub label: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBillingResponse {
    pub generated_at_ms: i64,
    pub admin_token_configured: bool,
    pub summary: AdminBillingSummary,
    pub policy: AdminBillingPolicy,
    pub plans: Vec<AdminBillingPlan>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBillingSummary {
    pub total_accounts: i64,
    pub paid_accounts: i64,
    pub active_accounts: i64,
    pub read_only_accounts: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBillingPlan {
    pub plan_key: String,
    pub name: String,
    pub quota: String,
    pub cycle: String,
    pub write_access: String,
    pub archive: String,
    pub account_count: i64,
    pub active_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStorageResponse {
    pub generated_at_ms: i64,
    pub database_kind: String,
    pub summary: AdminStorageSummary,
    pub nodes: Vec<AdminStorageNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStorageSummary {
    pub total_vaults: i64,
    pub total_ops: i64,
    pub active_sessions: i64,
    pub total_audit_logs: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStorageNode {
    pub provider: String,
    pub region: String,
    pub engine: String,
    pub websocket: String,
    pub status: String,
    pub records: i64,
    pub last_event_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAuditResponse {
    pub generated_at_ms: i64,
    pub total_logs: i64,
    pub logs: Vec<AdminAuditLog>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAuditLog {
    pub id: String,
    pub level: String,
    pub actor: String,
    pub action: String,
    pub target: String,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBackupTemplateResponse {
    pub generated_at_ms: i64,
    pub template: Value,
}

struct PlanCatalog {
    key: &'static str,
    name: &'static str,
    quota: &'static str,
    write_access: &'static str,
    archive: &'static str,
}

const PLAN_CATALOG: [PlanCatalog; 4] = [
    PlanCatalog {
        key: "self-provider",
        name: "Self Provider",
        quota: "1 vault / 1 keyspace",
        write_access: "读写",
        archive: "730 天",
    },
    PlanCatalog {
        key: "cloud-1k",
        name: "Cloud 1K",
        quota: "1,000 keys",
        write_access: "读写",
        archive: "365 天只读",
    },
    PlanCatalog {
        key: "cloud-10k",
        name: "Cloud 10K",
        quota: "10,000 keys",
        write_access: "读写",
        archive: "365 天只读",
    },
    PlanCatalog {
        key: "private-cluster",
        name: "Private Cluster",
        quota: "无限",
        write_access: "读写",
        archive: "用户自管",
    },
];

pub async fn load_admin_overview(
    pool: &AnyPool,
    database_kind: DatabaseKind,
) -> Result<AdminOverviewResponse, sqlx::Error> {
    let generated_at_ms = now_ms();
    let since_24h = generated_at_ms - DAY_MS;

    let active_vaults_24h = count_with_i64(
        pool,
        "SELECT COUNT(*) AS count FROM vaults WHERE updated_at_ms >= ?",
        since_24h,
    )
    .await?;
    let paid_accounts = count_all(
        pool,
        "SELECT COUNT(*) AS count FROM billing_accounts WHERE plan <> 'self-provider'",
    )
    .await?;
    let active_sessions = count_with_i64(
        pool,
        "SELECT COUNT(*) AS count FROM sessions WHERE expires_at_ms >= ?",
        generated_at_ms,
    )
    .await?;
    let recent_ops_24h = count_with_i64(
        pool,
        "SELECT COUNT(*) AS count FROM vault_ops WHERE created_at_ms >= ?",
        since_24h,
    )
    .await?;
    let total_audit_logs = count_all(pool, "SELECT COUNT(*) AS count FROM audit_logs").await?;

    let topology = vec![
        AdminTopologyNode {
            name: "Unified Gateway".to_string(),
            role: "HTTP JSON / gRPC / WebSocket".to_string(),
            status: "healthy".to_string(),
            region: "Runtime".to_string(),
            detail: "一个进程同时暴露 REST、gRPC 和实时同步能力。".to_string(),
        },
        AdminTopologyNode {
            name: format!("{} Primary", database_label(database_kind)),
            role: "Vault metadata + billing".to_string(),
            status: "healthy".to_string(),
            region: "Primary Store".to_string(),
            detail: format!("当前运行在 {} 后端上。", database_kind),
        },
        AdminTopologyNode {
            name: "Audit Trail".to_string(),
            role: "Append-only operation logs".to_string(),
            status: if total_audit_logs > 0 {
                "healthy"
            } else {
                "warning"
            }
            .to_string(),
            region: "Primary Store".to_string(),
            detail: if total_audit_logs > 0 {
                "最近有写入事件进入审计表。".to_string()
            } else {
                "尚未观测到审计日志，建议先执行一次写入验证。".to_string()
            },
        },
    ];

    let checklist = vec![
        AdminChecklistItem {
            label: "Self Provider 浏览器同步已可用".to_string(),
            done: true,
        },
        AdminChecklistItem {
            label: "服务端已经记录近 24 小时写操作".to_string(),
            done: recent_ops_24h > 0,
        },
        AdminChecklistItem {
            label: "计费表中已有可运营的付费账户".to_string(),
            done: paid_accounts > 0,
        },
        AdminChecklistItem {
            label: "审计表正在累计关键写操作".to_string(),
            done: total_audit_logs > 0,
        },
    ];

    Ok(AdminOverviewResponse {
        generated_at_ms,
        database_kind: database_kind.to_string(),
        active_vaults_24h,
        paid_accounts,
        active_sessions,
        recent_ops_24h,
        topology,
        checklist,
    })
}

pub async fn load_admin_billing(
    pool: &AnyPool,
    admin_token_configured: bool,
) -> Result<AdminBillingResponse, sqlx::Error> {
    let generated_at_ms = now_ms();
    let policy = load_admin_billing_policy(pool).await?;
    let total_accounts = count_all(pool, "SELECT COUNT(*) AS count FROM billing_accounts").await?;
    let paid_accounts = count_all(
        pool,
        "SELECT COUNT(*) AS count FROM billing_accounts WHERE plan <> 'self-provider'",
    )
    .await?;
    let active_accounts = count_with_i64(
        pool,
        "SELECT COUNT(*) AS count FROM billing_accounts WHERE status = 'ACTIVE' AND write_enabled_until_ms >= ?",
        generated_at_ms,
    )
    .await?;
    let read_only_accounts = count_with_i64(
        pool,
        "SELECT COUNT(*) AS count FROM billing_accounts WHERE status <> 'ACTIVE' OR write_enabled_until_ms < ?",
        generated_at_ms,
    )
    .await?;

    let mut plan_rows = sqlx::query(
        "SELECT plan, COUNT(*) AS account_count, SUM(CASE WHEN status = 'ACTIVE' AND write_enabled_until_ms >= ? THEN 1 ELSE 0 END) AS active_count FROM billing_accounts GROUP BY plan",
    )
    .bind(generated_at_ms)
    .fetch_all(pool)
    .await?;

    let mut counts = BTreeMap::<String, (i64, i64)>::new();
    for row in plan_rows.drain(..) {
        let plan = row.try_get::<String, _>("plan")?;
        let account_count = row.try_get::<i64, _>("account_count")?;
        let active_count = row.try_get::<Option<i64>, _>("active_count")?.unwrap_or(0);
        counts.insert(plan, (account_count, active_count));
    }

    let mut plans = PLAN_CATALOG
        .iter()
        .map(|plan| {
            let (account_count, active_count) = counts.remove(plan.key).unwrap_or((0, 0));
            AdminBillingPlan {
                plan_key: plan.key.to_string(),
                name: plan.name.to_string(),
                quota: plan.quota.to_string(),
                cycle: plan_cycle(plan.key, &policy),
                write_access: plan.write_access.to_string(),
                archive: plan.archive.to_string(),
                account_count,
                active_count,
            }
        })
        .collect::<Vec<_>>();

    for (plan_key, (account_count, active_count)) in counts {
        plans.push(AdminBillingPlan {
            name: plan_key.clone(),
            plan_key,
            quota: "自定义".to_string(),
            cycle: "待定义".to_string(),
            write_access: "按 entitlement 计算".to_string(),
            archive: "待定义".to_string(),
            account_count,
            active_count,
        });
    }

    Ok(AdminBillingResponse {
        generated_at_ms,
        admin_token_configured,
        summary: AdminBillingSummary {
            total_accounts,
            paid_accounts,
            active_accounts,
            read_only_accounts,
        },
        policy,
        plans,
    })
}

pub async fn load_admin_storage(
    pool: &AnyPool,
    database_kind: DatabaseKind,
) -> Result<AdminStorageResponse, sqlx::Error> {
    let generated_at_ms = now_ms();
    let total_vaults = count_all(pool, "SELECT COUNT(*) AS count FROM vaults").await?;
    let total_ops = count_all(pool, "SELECT COUNT(*) AS count FROM vault_ops").await?;
    let active_sessions = count_with_i64(
        pool,
        "SELECT COUNT(*) AS count FROM sessions WHERE expires_at_ms >= ?",
        generated_at_ms,
    )
    .await?;
    let total_audit_logs = count_all(pool, "SELECT COUNT(*) AS count FROM audit_logs").await?;
    let last_vault_event =
        optional_i64(pool, "SELECT MAX(updated_at_ms) AS value FROM vaults").await?;
    let last_op_event =
        optional_i64(pool, "SELECT MAX(created_at_ms) AS value FROM vault_ops").await?;
    let last_audit_event =
        optional_i64(pool, "SELECT MAX(created_at_ms) AS value FROM audit_logs").await?;

    let nodes = vec![
        AdminStorageNode {
            provider: database_label(database_kind).to_string(),
            region: "Primary Store".to_string(),
            engine: format!("{} metadata + billing", database_label(database_kind)),
            websocket: "N/A".to_string(),
            status: "online".to_string(),
            records: total_vaults,
            last_event_at_ms: last_vault_event,
        },
        AdminStorageNode {
            provider: "Sync Op Log".to_string(),
            region: "Primary Store".to_string(),
            engine: "Encrypted operation rows".to_string(),
            websocket: "Built-in relay".to_string(),
            status: if total_ops > 0 { "online" } else { "degraded" }.to_string(),
            records: total_ops,
            last_event_at_ms: last_op_event,
        },
        AdminStorageNode {
            provider: "Active Sessions".to_string(),
            region: "Runtime".to_string(),
            engine: "Challenge / session cache".to_string(),
            websocket: "Readiness signal".to_string(),
            status: "online".to_string(),
            records: active_sessions,
            last_event_at_ms: Some(generated_at_ms),
        },
        AdminStorageNode {
            provider: "Audit Trail".to_string(),
            region: "Primary Store".to_string(),
            engine: "Append-only logs".to_string(),
            websocket: "N/A".to_string(),
            status: if total_audit_logs > 0 {
                "online"
            } else {
                "degraded"
            }
            .to_string(),
            records: total_audit_logs,
            last_event_at_ms: last_audit_event,
        },
    ];

    Ok(AdminStorageResponse {
        generated_at_ms,
        database_kind: database_kind.to_string(),
        summary: AdminStorageSummary {
            total_vaults,
            total_ops,
            active_sessions,
            total_audit_logs,
        },
        nodes,
    })
}

pub async fn load_admin_audit(pool: &AnyPool) -> Result<AdminAuditResponse, sqlx::Error> {
    let generated_at_ms = now_ms();
    let total_logs = count_all(pool, "SELECT COUNT(*) AS count FROM audit_logs").await?;
    let rows = sqlx::query(
        "SELECT id, action, subject, created_at_ms FROM audit_logs ORDER BY created_at_ms DESC LIMIT 50",
    )
    .fetch_all(pool)
    .await?;

    let logs = rows
        .into_iter()
        .map(|row| {
            let action = row.try_get::<String, _>("action")?;
            let target = row.try_get::<String, _>("subject")?;
            let created_at_ms = row.try_get::<i64, _>("created_at_ms")?;
            Ok(AdminAuditLog {
                id: row.try_get::<String, _>("id")?,
                level: classify_audit_level(&action).to_string(),
                actor: "system".to_string(),
                action,
                target,
                created_at_ms,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;

    Ok(AdminAuditResponse {
        generated_at_ms,
        total_logs,
        logs,
    })
}

pub async fn load_admin_backup_template(
    pool: &AnyPool,
    database_kind: DatabaseKind,
    admin_token_configured: bool,
) -> Result<AdminBackupTemplateResponse, sqlx::Error> {
    let generated_at_ms = now_ms();
    let billing = load_admin_billing(pool, admin_token_configured).await?;
    let storage = load_admin_storage(pool, database_kind).await?;

    Ok(AdminBackupTemplateResponse {
        generated_at_ms,
        template: json!({
            "version": 1,
            "generatedAtMs": generated_at_ms,
            "database": {
                "kind": database_kind.to_string(),
                "summary": storage.summary,
            },
            "billing": {
                "policy": billing.policy,
                "summary": billing.summary,
                "plans": billing.plans,
            },
            "auth": {
                "challengeLogin": true,
                "websocket": true,
                "adminApiMode": if admin_token_configured { "token-write-enabled" } else { "read-only" },
            },
            "storage": {
                "nodes": storage.nodes,
            },
        }),
    })
}

async fn count_all(pool: &AnyPool, sql: &str) -> Result<i64, sqlx::Error> {
    let row = sqlx::query(sql).fetch_one(pool).await?;
    row.try_get("count")
}

async fn count_with_i64(pool: &AnyPool, sql: &str, value: i64) -> Result<i64, sqlx::Error> {
    let row = sqlx::query(sql).bind(value).fetch_one(pool).await?;
    row.try_get("count")
}

async fn optional_i64(pool: &AnyPool, sql: &str) -> Result<Option<i64>, sqlx::Error> {
    let row = sqlx::query(sql).fetch_one(pool).await?;
    row.try_get("value")
}

fn classify_audit_level(action: &str) -> &'static str {
    let action = action.trim().to_ascii_lowercase();
    if action.contains("panic") || action.contains("fail") || action.contains("error") {
        "critical"
    } else if action.contains("warn") || action.contains("lag") || action.contains("retry") {
        "warning"
    } else {
        "info"
    }
}

fn database_label(database_kind: DatabaseKind) -> &'static str {
    match database_kind {
        DatabaseKind::Sqlite => "SQLite",
        DatabaseKind::Postgres => "PostgreSQL",
    }
}

fn plan_cycle(plan_key: &str, policy: &AdminBillingPolicy) -> String {
    match plan_key {
        "self-provider" => "免费".to_string(),
        "cloud-1k" => format!(
            "USD {} / 年 · CNY {} / 年",
            policy.cloud_1k_annual_usd, policy.cloud_1k_annual_cny
        ),
        "cloud-10k" => "$8 / 年".to_string(),
        "private-cluster" => "自部署".to_string(),
        _ => "待定义".to_string(),
    }
}

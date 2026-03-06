use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::HeaderMap,
    routing::{get, put},
};
use gaubee_2fa_server_core::{
    AdminAuditResponse, AdminBackupTemplateResponse, AdminBillingPolicy, AdminBillingResponse,
    AdminOverviewResponse, AdminStorageResponse, AppState,
};
use serde::Deserialize;

use crate::{http::ApiError, service};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBillingPolicyRequest {
    cloud_1k_annual_usd: i64,
    cloud_1k_annual_cny: i64,
    grace_days: i64,
    readonly_days: i64,
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/admin/overview", get(get_admin_overview))
        .route("/api/v1/admin/billing", get(get_admin_billing))
        .route(
            "/api/v1/admin/billing/policy",
            put(put_admin_billing_policy),
        )
        .route("/api/v1/admin/storage", get(get_admin_storage))
        .route("/api/v1/admin/audit", get(get_admin_audit))
        .route(
            "/api/v1/admin/backup/template",
            get(get_admin_backup_template),
        )
}

async fn get_admin_overview(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AdminOverviewResponse>, ApiError> {
    Ok(Json(service::get_admin_overview(&state).await?))
}

async fn get_admin_billing(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AdminBillingResponse>, ApiError> {
    Ok(Json(service::get_admin_billing(&state).await?))
}

async fn put_admin_billing_policy(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(request): Json<UpdateBillingPolicyRequest>,
) -> Result<Json<AdminBillingResponse>, ApiError> {
    let admin_token = read_admin_token(&headers);
    Ok(Json(
        service::update_admin_billing_policy(
            &state,
            admin_token,
            AdminBillingPolicy {
                cloud_1k_annual_usd: request.cloud_1k_annual_usd,
                cloud_1k_annual_cny: request.cloud_1k_annual_cny,
                grace_days: request.grace_days,
                readonly_days: request.readonly_days,
            },
        )
        .await?,
    ))
}

async fn get_admin_storage(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AdminStorageResponse>, ApiError> {
    Ok(Json(service::get_admin_storage(&state).await?))
}

async fn get_admin_audit(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AdminAuditResponse>, ApiError> {
    Ok(Json(service::get_admin_audit(&state).await?))
}

async fn get_admin_backup_template(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AdminBackupTemplateResponse>, ApiError> {
    Ok(Json(service::get_admin_backup_template(&state).await?))
}

fn read_admin_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-admin-token")
        .and_then(|value| value.to_str().ok())
}

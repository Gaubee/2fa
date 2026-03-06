use std::sync::Arc;

use gaubee_2fa_crypto_core::{SignedChallenge, verify_signed_challenge};
use gaubee_2fa_server_core::{
    AdminAuditResponse, AdminBackupTemplateResponse, AdminBillingPolicy, AdminBillingResponse,
    AdminOverviewResponse, AdminStorageResponse, AppState, BillingState, SessionRecord,
    create_challenge, create_session, current_revision, fetch_ops, get_session, load_admin_audit,
    load_admin_backup_template, load_admin_billing, load_admin_overview, load_admin_storage, proto,
    proto_entitlement, proto_to_persisted_op, store_admin_billing_policy, store_ops,
    sync_op_to_proto, take_challenge,
};
use tonic::Status;

pub async fn get_challenge(
    state: &Arc<AppState>,
    request: proto::GetChallengeRequest,
) -> Result<proto::GetChallengeResponse, Status> {
    let challenge = create_challenge(&state.pool, &request.public_key_hint)
        .await
        .map_err(internal_status)?;

    Ok(proto::GetChallengeResponse {
        nonce: challenge.nonce,
        server_time_ms: challenge.created_at_ms,
        expires_at_ms: challenge.expires_at_ms,
    })
}

pub async fn exchange_session(
    state: &Arc<AppState>,
    request: proto::ExchangeSessionRequest,
) -> Result<proto::ExchangeSessionResponse, Status> {
    let Some(challenge) = take_challenge(&state.pool, &request.nonce)
        .await
        .map_err(internal_status)?
    else {
        return Err(Status::unauthenticated("challenge not found"));
    };
    if challenge.expires_at_ms < gaubee_2fa_server_core::now_ms() {
        return Err(Status::unauthenticated("challenge expired"));
    }

    let signed = SignedChallenge {
        public_key_hex: request.public_key_hex,
        signature_hex: request.signature_hex,
        timestamp_ms: request.timestamp_ms,
        device_id: request.device_id,
        nonce: request.nonce,
    };
    verify_signed_challenge(&signed).map_err(|_| Status::unauthenticated("invalid signature"))?;

    let session = create_session(&state.pool, &signed.public_key_hex)
        .await
        .map_err(internal_status)?;
    let entitlement = BillingState {
        plan: session.plan.clone(),
        status: session.status.clone(),
        write_enabled_until_ms: session.write_enabled_until_ms,
        archive_until_ms: session.archive_until_ms,
    };

    Ok(proto::ExchangeSessionResponse {
        token: session.token,
        expires_at_ms: session.expires_at_ms,
        vault_id: session.vault_id,
        entitlement: Some(proto_entitlement(&entitlement)),
    })
}

pub async fn pull_ops(
    state: &Arc<AppState>,
    request: proto::PullOpsRequest,
) -> Result<proto::PullOpsResponse, Status> {
    let session = require_session(state, &request.session_token).await?;
    ensure_vault_access(&session, &request.vault_id)?;

    let ops = fetch_ops(&state.pool, &request.vault_id)
        .await
        .map_err(internal_status)?;
    let revision = current_revision(&state.pool, &request.vault_id)
        .await
        .map_err(internal_status)?;

    Ok(proto::PullOpsResponse {
        ops: ops.iter().map(sync_op_to_proto).collect(),
        new_revision: revision.clone(),
        cursor: revision,
    })
}

pub async fn push_ops(
    state: &Arc<AppState>,
    request: proto::PushOpsRequest,
) -> Result<proto::PushOpsResponse, Status> {
    let session = require_session(state, &request.session_token).await?;
    ensure_vault_access(&session, &request.vault_id)?;
    if session.status != "ACTIVE" {
        return Err(Status::failed_precondition("vault is read only"));
    }

    let accepted_op_ids = request
        .ops
        .iter()
        .map(|op| op.op_id.clone())
        .collect::<Vec<_>>();
    let ops = request
        .ops
        .into_iter()
        .map(|op| proto_to_persisted_op(&request.vault_id, op))
        .collect::<Vec<_>>();
    let revision = store_ops(&state.pool, &request.vault_id, &ops)
        .await
        .map_err(internal_status)?;
    let _ = state.events.send(gaubee_2fa_server_core::SyncEvent {
        vault_id: request.vault_id,
        revision: revision.clone(),
    });

    Ok(proto::PushOpsResponse {
        accepted_op_ids,
        rejected_op_ids: Vec::new(),
        new_revision: revision,
    })
}

pub async fn get_revision(
    state: &Arc<AppState>,
    request: proto::GetRevisionRequest,
) -> Result<proto::GetRevisionResponse, Status> {
    let session = require_session(state, &request.session_token).await?;
    ensure_vault_access(&session, &request.vault_id)?;

    let revision = current_revision(&state.pool, &request.vault_id)
        .await
        .map_err(internal_status)?;
    Ok(proto::GetRevisionResponse { revision })
}

pub async fn get_entitlement(
    state: &Arc<AppState>,
    request: proto::GetEntitlementRequest,
) -> Result<proto::GetEntitlementResponse, Status> {
    let session = require_session(state, &request.session_token).await?;
    let entitlement = BillingState {
        plan: session.plan,
        status: session.status,
        write_enabled_until_ms: session.write_enabled_until_ms,
        archive_until_ms: session.archive_until_ms,
    };

    Ok(proto::GetEntitlementResponse {
        entitlement: Some(proto_entitlement(&entitlement)),
    })
}

pub async fn get_admin_overview(state: &Arc<AppState>) -> Result<AdminOverviewResponse, Status> {
    load_admin_overview(&state.pool, state.database_kind)
        .await
        .map_err(internal_status)
}

pub async fn get_admin_billing(state: &Arc<AppState>) -> Result<AdminBillingResponse, Status> {
    load_admin_billing(&state.pool, state.admin_token.is_some())
        .await
        .map_err(internal_status)
}

pub async fn update_admin_billing_policy(
    state: &Arc<AppState>,
    provided_token: Option<&str>,
    policy: AdminBillingPolicy,
) -> Result<AdminBillingResponse, Status> {
    require_admin_token(state, provided_token)?;
    validate_billing_policy(&policy)?;
    store_admin_billing_policy(&state.pool, &policy)
        .await
        .map_err(internal_status)?;
    get_admin_billing(state).await
}

pub async fn get_admin_storage(state: &Arc<AppState>) -> Result<AdminStorageResponse, Status> {
    load_admin_storage(&state.pool, state.database_kind)
        .await
        .map_err(internal_status)
}

pub async fn get_admin_audit(state: &Arc<AppState>) -> Result<AdminAuditResponse, Status> {
    load_admin_audit(&state.pool).await.map_err(internal_status)
}

pub async fn get_admin_backup_template(
    state: &Arc<AppState>,
) -> Result<AdminBackupTemplateResponse, Status> {
    load_admin_backup_template(
        &state.pool,
        state.database_kind,
        state.admin_token.is_some(),
    )
    .await
    .map_err(internal_status)
}

pub async fn require_session(state: &Arc<AppState>, token: &str) -> Result<SessionRecord, Status> {
    let Some(session) = get_session(&state.pool, token)
        .await
        .map_err(internal_status)?
    else {
        return Err(Status::unauthenticated("session not found"));
    };
    if session.expires_at_ms < gaubee_2fa_server_core::now_ms() {
        return Err(Status::unauthenticated("session expired"));
    }
    Ok(session)
}

fn ensure_vault_access(session: &SessionRecord, vault_id: &str) -> Result<(), Status> {
    if session.vault_id != vault_id {
        return Err(Status::permission_denied("vault mismatch"));
    }
    Ok(())
}

fn require_admin_token(state: &Arc<AppState>, provided_token: Option<&str>) -> Result<(), Status> {
    let Some(expected_token) = state.admin_token.as_deref() else {
        return Err(Status::failed_precondition(
            "admin token not configured on server",
        ));
    };
    let Some(provided_token) = provided_token
        .map(str::trim)
        .filter(|token| !token.is_empty())
    else {
        return Err(Status::unauthenticated("missing x-admin-token header"));
    };
    if provided_token != expected_token {
        return Err(Status::permission_denied("invalid admin token"));
    }
    Ok(())
}

fn validate_billing_policy(policy: &AdminBillingPolicy) -> Result<(), Status> {
    if policy.cloud_1k_annual_usd < 0
        || policy.cloud_1k_annual_cny < 0
        || policy.grace_days < 0
        || policy.readonly_days < 0
    {
        return Err(Status::invalid_argument(
            "billing policy values must be non-negative",
        ));
    }
    Ok(())
}

fn internal_status(error: impl std::fmt::Display) -> Status {
    Status::internal(error.to_string())
}

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Query, State, WebSocketUpgrade, ws::Message},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use futures_util::{SinkExt, StreamExt};
use gaubee_2fa_server_core::{AppState, SyncEvent, proto};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tonic::Code;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::service;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WsQuery {
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChallengeRequest {
    public_key_hint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRequest {
    public_key_hex: String,
    signature_hex: String,
    device_id: String,
    timestamp_ms: i64,
    nonce: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullQuery {
    session_token: String,
    vault_id: String,
    #[serde(default)]
    base_revision: String,
    #[serde(default)]
    cursor: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushRequest {
    session_token: String,
    vault_id: String,
    #[serde(default)]
    base_revision: String,
    ops: Vec<JsonSyncOp>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevisionQuery {
    session_token: String,
    vault_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntitlementQuery {
    session_token: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonHlc {
    wall_ms: i64,
    counter: u32,
    node_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonSyncOp {
    op_id: String,
    entity_id: String,
    kind: String,
    hlc: JsonHlc,
    cipher_base64: String,
    aad_base64: String,
    hash_hex: String,
    deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonEntitlement {
    plan: String,
    status: String,
    write_enabled_until_ms: i64,
    archive_until_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: String,
    error: String,
}

pub(crate) struct ApiError(tonic::Status);

impl From<tonic::Status> for ApiError {
    fn from(value: tonic::Status) -> Self {
        Self(value)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.0.code() {
            Code::InvalidArgument => StatusCode::BAD_REQUEST,
            Code::Unauthenticated => StatusCode::UNAUTHORIZED,
            Code::PermissionDenied => StatusCode::FORBIDDEN,
            Code::NotFound => StatusCode::NOT_FOUND,
            Code::AlreadyExists => StatusCode::CONFLICT,
            Code::FailedPrecondition => StatusCode::PRECONDITION_FAILED,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (
            status,
            Json(ErrorBody {
                code: self.0.code().to_string(),
                error: self.0.message().to_string(),
            }),
        )
            .into_response()
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .merge(crate::admin_http::router())
        .route("/healthz", get(healthz))
        .route("/api/v1/auth/challenge", post(post_challenge))
        .route("/api/v1/auth/session", post(post_session))
        .route("/api/v1/sync/pull", get(get_pull))
        .route("/api/v1/sync/push", post(post_push))
        .route("/api/v1/sync/revision", get(get_revision))
        .route("/api/v1/billing/entitlement", get(get_entitlement))
        .route("/ws/sync", get(ws_sync))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

async fn healthz() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn post_challenge(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ChallengeRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let response = service::get_challenge(
        &state,
        proto::GetChallengeRequest {
            public_key_hint: request.public_key_hint,
        },
    )
    .await?;
    Ok(Json(json!({
        "nonce": response.nonce,
        "serverTimeMs": response.server_time_ms,
        "expiresAtMs": response.expires_at_ms,
    })))
}

async fn post_session(
    State(state): State<Arc<AppState>>,
    Json(request): Json<SessionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let response = service::exchange_session(
        &state,
        proto::ExchangeSessionRequest {
            public_key_hex: request.public_key_hex,
            signature_hex: request.signature_hex,
            device_id: request.device_id,
            timestamp_ms: request.timestamp_ms,
            nonce: request.nonce,
        },
    )
    .await?;
    Ok(Json(json!({
        "token": response.token,
        "expiresAtMs": response.expires_at_ms,
        "vaultId": response.vault_id,
        "entitlement": response.entitlement.map(json_entitlement_from_proto),
    })))
}

async fn get_pull(
    State(state): State<Arc<AppState>>,
    Query(query): Query<PullQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let response = service::pull_ops(
        &state,
        proto::PullOpsRequest {
            session_token: query.session_token,
            vault_id: query.vault_id,
            base_revision: query.base_revision,
            cursor: query.cursor,
        },
    )
    .await?;

    Ok(Json(json!({
        "ops": response.ops.into_iter().map(json_sync_op_from_proto).collect::<Vec<_>>(),
        "newRevision": response.new_revision,
        "cursor": response.cursor,
    })))
}

async fn post_push(
    State(state): State<Arc<AppState>>,
    Json(request): Json<PushRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let ops = request
        .ops
        .into_iter()
        .map(json_sync_op_to_proto)
        .collect::<Result<Vec<_>, _>>()?;
    let response = service::push_ops(
        &state,
        proto::PushOpsRequest {
            session_token: request.session_token,
            vault_id: request.vault_id,
            base_revision: request.base_revision,
            ops,
        },
    )
    .await?;
    Ok(Json(json!({
        "acceptedOpIds": response.accepted_op_ids,
        "rejectedOpIds": response.rejected_op_ids,
        "newRevision": response.new_revision,
    })))
}

async fn get_revision(
    State(state): State<Arc<AppState>>,
    Query(query): Query<RevisionQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let response = service::get_revision(
        &state,
        proto::GetRevisionRequest {
            session_token: query.session_token,
            vault_id: query.vault_id,
        },
    )
    .await?;
    Ok(Json(json!({
        "revision": response.revision,
    })))
}

async fn get_entitlement(
    State(state): State<Arc<AppState>>,
    Query(query): Query<EntitlementQuery>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let response = service::get_entitlement(
        &state,
        proto::GetEntitlementRequest {
            session_token: query.session_token,
        },
    )
    .await?;

    Ok(Json(json!({
        "entitlement": response.entitlement.map(json_entitlement_from_proto),
    })))
}

async fn ws_sync(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, query.token, state))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, token: String, state: Arc<AppState>) {
    let Ok(session) = service::require_session(&state, &token).await else {
        return;
    };

    let vault_id = session.vault_id;
    let mut receiver = state.events.subscribe();
    let (mut sender, mut incoming) = socket.split();

    if sender
        .send(Message::Text(
            json!({ "type": "ready", "vaultId": vault_id, "status": session.status })
                .to_string()
                .into(),
        ))
        .await
        .is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            event = receiver.recv() => {
                let Ok(SyncEvent { vault_id: event_vault_id, revision }) = event else {
                    continue;
                };
                if event_vault_id == vault_id && sender.send(Message::Text(json!({ "type": "revision", "revision": revision }).to_string().into())).await.is_err() {
                    break;
                }
            }
            message = incoming.next() => {
                match message {
                    Some(Ok(Message::Ping(payload))) => {
                        if sender.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

fn json_sync_op_from_proto(op: proto::SyncOp) -> JsonSyncOp {
    let hlc = op.hlc.unwrap_or_default();
    JsonSyncOp {
        op_id: op.op_id,
        entity_id: op.entity_id,
        kind: op.kind,
        hlc: JsonHlc {
            wall_ms: hlc.wall_ms,
            counter: hlc.counter,
            node_id: hlc.node_id,
        },
        cipher_base64: BASE64.encode(op.cipher),
        aad_base64: BASE64.encode(op.aad),
        hash_hex: op.hash_hex,
        deleted: op.deleted,
    }
}

fn json_sync_op_to_proto(op: JsonSyncOp) -> Result<proto::SyncOp, ApiError> {
    let cipher = BASE64
        .decode(op.cipher_base64.as_bytes())
        .map_err(|_| ApiError(tonic::Status::invalid_argument("invalid cipherBase64")))?;
    let aad = BASE64
        .decode(op.aad_base64.as_bytes())
        .map_err(|_| ApiError(tonic::Status::invalid_argument("invalid aadBase64")))?;

    Ok(proto::SyncOp {
        op_id: op.op_id,
        entity_id: op.entity_id,
        kind: op.kind,
        hlc: Some(proto::Hlc {
            wall_ms: op.hlc.wall_ms,
            counter: op.hlc.counter,
            node_id: op.hlc.node_id,
        }),
        cipher,
        aad,
        hash_hex: op.hash_hex,
        deleted: op.deleted,
    })
}

fn json_entitlement_from_proto(entitlement: proto::Entitlement) -> JsonEntitlement {
    JsonEntitlement {
        plan: entitlement.plan,
        status: entitlement.status,
        write_enabled_until_ms: entitlement.write_enabled_until_ms,
        archive_until_ms: entitlement.archive_until_ms,
    }
}

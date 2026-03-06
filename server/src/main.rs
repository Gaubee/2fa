mod admin_http;
mod grpc;
mod http;
mod service;

use std::{net::SocketAddr, str::FromStr, sync::Arc};

use clap::Parser;
use gaubee_2fa_server_core::{AppState, DatabaseKind, init_database, proto};
use grpc::{AuthGrpcService, BillingGrpcService, SyncGrpcService};
use sqlx::any::{AnyConnectOptions, AnyPoolOptions, install_default_drivers};
use tonic::transport::Server;
use tonic_web::GrpcWebLayer;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{EnvFilter, fmt};

#[derive(Debug, Parser)]
struct Args {
    #[arg(long, env = "GAUBEE_2FA_HTTP", default_value = "127.0.0.1:8080")]
    http: SocketAddr,
    #[arg(long, env = "GAUBEE_2FA_GRPC", default_value = "[::1]:50051")]
    grpc: SocketAddr,
    #[arg(long, env = "GAUBEE_2FA_DB", default_value = "sqlite")]
    db: String,
    #[arg(long, env = "GAUBEE_2FA_DATABASE_URL")]
    database_url: Option<String>,
    #[arg(long, env = "GAUBEE_2FA_ADMIN_TOKEN")]
    admin_token: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    fmt().with_env_filter(EnvFilter::from_default_env()).init();

    let args = Args::parse();
    install_default_drivers();

    let db_kind = DatabaseKind::from_str(&args.db)?;
    let database_url = args
        .database_url
        .unwrap_or_else(|| default_database_url(db_kind));
    let options = AnyConnectOptions::from_str(&database_url)?;
    let pool = AnyPoolOptions::new()
        .max_connections(10)
        .connect_with(options)
        .await?;
    init_database(&pool).await?;

    let (events, _) = tokio::sync::broadcast::channel(128);
    let state = Arc::new(AppState {
        pool,
        events,
        database_kind: db_kind,
        admin_token: normalize_admin_token(args.admin_token),
    });

    let grpc_state = state.clone();
    let http_state = state.clone();

    let grpc_server = Server::builder()
        .accept_http1(true)
        .layer(CorsLayer::permissive())
        .layer(GrpcWebLayer::new())
        .add_service(proto::auth_service_server::AuthServiceServer::new(
            AuthGrpcService {
                state: grpc_state.clone(),
            },
        ))
        .add_service(proto::sync_service_server::SyncServiceServer::new(
            SyncGrpcService {
                state: grpc_state.clone(),
            },
        ))
        .add_service(proto::billing_service_server::BillingServiceServer::new(
            BillingGrpcService { state: grpc_state },
        ))
        .serve(args.grpc);

    let http_listener = tokio::net::TcpListener::bind(args.http).await?;
    let http_server = axum::serve(http_listener, http::router(http_state));

    tracing::info!(http = %args.http, grpc = %args.grpc, db = %db_kind, admin_write = state.admin_token.is_some(), "gaubee 2fa server started");

    let (grpc_result, http_result) = tokio::join!(grpc_server, http_server);
    grpc_result?;
    http_result?;
    Ok(())
}

fn default_database_url(db_kind: DatabaseKind) -> String {
    match db_kind {
        DatabaseKind::Sqlite => "sqlite://.local/gaubee-2fa.db?mode=rwc".to_string(),
        DatabaseKind::Postgres => "postgres://gaubee:gaubee@127.0.0.1:5432/gaubee_2fa".to_string(),
    }
}

fn normalize_admin_token(value: Option<String>) -> Option<String> {
    value.and_then(|token| {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

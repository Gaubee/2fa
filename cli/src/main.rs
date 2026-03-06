use clap::{Parser, Subcommand};
use gaubee_2fa_crypto_core::{SignatureChallenge, sign_challenge};
use gaubee_2fa_server_core::proto::{
    self, auth_service_client::AuthServiceClient, billing_service_client::BillingServiceClient,
    sync_service_client::SyncServiceClient,
};
use serde_json::json;

#[derive(Debug, Parser)]
struct Cli {
    #[arg(long, default_value = "http://127.0.0.1:50051")]
    server: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Login {
        #[arg(long)]
        secret: String,
        #[arg(long, default_value = "cli")]
        device_id: String,
    },
    Revision {
        #[arg(long)]
        token: String,
        #[arg(long)]
        vault_id: String,
    },
    Pull {
        #[arg(long)]
        token: String,
        #[arg(long)]
        vault_id: String,
    },
    Entitlement {
        #[arg(long)]
        token: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Command::Login { secret, device_id } => {
            let mut auth = AuthServiceClient::connect(cli.server).await?;
            let challenge = auth
                .get_challenge(proto::GetChallengeRequest {
                    public_key_hint: String::new(),
                })
                .await?
                .into_inner();
            let signed = sign_challenge(
                &secret,
                &SignatureChallenge {
                    nonce: challenge.nonce,
                    timestamp_ms: challenge.server_time_ms,
                    device_id,
                },
            )?;
            let session = auth
                .exchange_session(proto::ExchangeSessionRequest {
                    public_key_hex: signed.public_key_hex,
                    signature_hex: signed.signature_hex,
                    device_id: signed.device_id,
                    timestamp_ms: signed.timestamp_ms,
                    nonce: signed.nonce,
                })
                .await?
                .into_inner();
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "token": session.token,
                    "expiresAtMs": session.expires_at_ms,
                    "vaultId": session.vault_id,
                    "entitlement": session.entitlement.map(|entitlement| json!({
                        "plan": entitlement.plan,
                        "status": entitlement.status,
                        "writeEnabledUntilMs": entitlement.write_enabled_until_ms,
                        "archiveUntilMs": entitlement.archive_until_ms,
                    })),
                }))?
            );
        }
        Command::Revision { token, vault_id } => {
            let mut sync = SyncServiceClient::connect(cli.server).await?;
            let revision = sync
                .get_revision(proto::GetRevisionRequest {
                    session_token: token,
                    vault_id,
                })
                .await?
                .into_inner();
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({ "revision": revision.revision }))?
            );
        }
        Command::Pull { token, vault_id } => {
            let mut sync = SyncServiceClient::connect(cli.server).await?;
            let ops = sync
                .pull_ops(proto::PullOpsRequest {
                    session_token: token,
                    vault_id,
                    base_revision: String::new(),
                    cursor: String::new(),
                })
                .await?
                .into_inner();
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "newRevision": ops.new_revision,
                    "cursor": ops.cursor,
                    "ops": ops.ops.into_iter().map(|op| json!({
                        "opId": op.op_id,
                        "entityId": op.entity_id,
                        "kind": op.kind,
                        "deleted": op.deleted,
                        "hashHex": op.hash_hex,
                    })).collect::<Vec<_>>(),
                }))?
            );
        }
        Command::Entitlement { token } => {
            let mut billing = BillingServiceClient::connect(cli.server).await?;
            let entitlement = billing
                .get_entitlement(proto::GetEntitlementRequest {
                    session_token: token,
                })
                .await?
                .into_inner();
            println!(
                "{}",
                serde_json::to_string_pretty(&json!({
                    "entitlement": entitlement.entitlement.map(|entitlement| json!({
                        "plan": entitlement.plan,
                        "status": entitlement.status,
                        "writeEnabledUntilMs": entitlement.write_enabled_until_ms,
                        "archiveUntilMs": entitlement.archive_until_ms,
                    })),
                }))?
            );
        }
    }

    Ok(())
}

use async_trait::async_trait;
use gaubee_2fa_sync_core::SyncOp;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProviderId {
    Local,
    GitHubGist,
    GoogleDrive,
    SelfHosted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProviderCursor {
    pub provider: ProviderId,
    pub revision: String,
    pub last_sync_at_ms: i64,
    pub opaque_cursor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PullResult {
    pub ops: Vec<SyncOp>,
    pub cursor: ProviderCursor,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PushResult {
    pub accepted_op_ids: Vec<String>,
    pub rejected_op_ids: Vec<String>,
    pub revision: String,
}

#[async_trait]
pub trait ProviderClient: Send + Sync {
    fn id(&self) -> ProviderId;
    async fn pull(&self, cursor: &ProviderCursor) -> Result<PullResult, String>;
    async fn push(&self, ops: &[SyncOp], base_revision: &str) -> Result<PushResult, String>;
    fn supports_watch(&self) -> bool {
        false
    }
}

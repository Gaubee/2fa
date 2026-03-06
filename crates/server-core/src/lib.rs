pub mod admin;
pub mod billing_policy;
pub mod db;
pub mod models;

pub mod proto {
    tonic::include_proto!("gaubee.twofa.v1");
}

pub use admin::{
    AdminAuditLog, AdminAuditResponse, AdminBackupTemplateResponse, AdminBillingPlan,
    AdminBillingResponse, AdminBillingSummary, AdminChecklistItem, AdminOverviewResponse,
    AdminStorageNode, AdminStorageResponse, AdminStorageSummary, AdminTopologyNode,
    load_admin_audit, load_admin_backup_template, load_admin_billing, load_admin_overview,
    load_admin_storage,
};
pub use billing_policy::{
    AdminBillingPolicy, default_admin_billing_policy, default_entitlement_from_policy,
    load_admin_billing_policy, store_admin_billing_policy,
};
pub use db::{
    create_challenge, create_session, current_revision, fetch_ops, get_session, init_database,
    store_ops, take_challenge,
};
pub use models::{
    AppState, BillingState, ChallengeRecord, DatabaseKind, PersistedOp, SessionRecord, SyncEvent,
    default_entitlement, now_ms, proto_entitlement, proto_to_persisted_op, revision_from_ops,
    sync_op_to_proto,
};

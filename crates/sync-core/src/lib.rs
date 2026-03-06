use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct Hlc {
    pub wall_ms: i64,
    pub counter: u32,
    pub node_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum SyncOpKind {
    UpsertEntry,
    DeleteEntry,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncOp {
    pub op_id: String,
    pub entity_id: String,
    pub kind: SyncOpKind,
    pub hlc: Hlc,
    pub cipher: Vec<u8>,
    pub aad: Vec<u8>,
    pub hash_hex: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultRecord {
    pub id: String,
    pub encrypted_payload: Vec<u8>,
    pub deleted: bool,
    pub hlc: Hlc,
    pub updated_by: String,
}

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("entity id is empty")]
    EmptyEntity,
}

pub fn next_hlc(previous: Option<&Hlc>, wall_ms: i64, node_id: impl Into<String>) -> Hlc {
    let node_id = node_id.into();
    match previous {
        Some(last) if wall_ms < last.wall_ms => Hlc {
            wall_ms: last.wall_ms,
            counter: last.counter.saturating_add(1),
            node_id,
        },
        Some(last) if wall_ms == last.wall_ms => Hlc {
            wall_ms,
            counter: last.counter.saturating_add(1),
            node_id,
        },
        _ => Hlc {
            wall_ms,
            counter: 0,
            node_id,
        },
    }
}

pub fn apply_ops(
    existing: &BTreeMap<String, VaultRecord>,
    ops: &[SyncOp],
) -> Result<BTreeMap<String, VaultRecord>, SyncError> {
    let mut merged = existing.clone();
    let mut ordered_ops = ops.to_vec();
    ordered_ops.sort_by(|left, right| left.hlc.cmp(&right.hlc).then(left.op_id.cmp(&right.op_id)));

    for op in ordered_ops {
        if op.entity_id.is_empty() {
            return Err(SyncError::EmptyEntity);
        }

        let should_apply = merged
            .get(&op.entity_id)
            .map(|record| {
                record.hlc < op.hlc || (record.hlc == op.hlc && record.updated_by < op.op_id)
            })
            .unwrap_or(true);

        if should_apply {
            merged.insert(
                op.entity_id.clone(),
                VaultRecord {
                    id: op.entity_id,
                    encrypted_payload: op.cipher,
                    deleted: op.deleted || matches!(op.kind, SyncOpKind::DeleteEntry),
                    hlc: op.hlc,
                    updated_by: op.op_id,
                },
            );
        }
    }

    Ok(merged)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{Hlc, SyncOp, SyncOpKind, apply_ops};

    #[test]
    fn newer_hlc_wins() {
        let old = SyncOp {
            op_id: "1".into(),
            entity_id: "entry".into(),
            kind: SyncOpKind::UpsertEntry,
            hlc: Hlc {
                wall_ms: 1,
                counter: 0,
                node_id: "a".into(),
            },
            cipher: b"old".to_vec(),
            aad: vec![],
            hash_hex: "old".into(),
            deleted: false,
        };
        let new = SyncOp {
            op_id: "2".into(),
            entity_id: "entry".into(),
            kind: SyncOpKind::UpsertEntry,
            hlc: Hlc {
                wall_ms: 2,
                counter: 0,
                node_id: "b".into(),
            },
            cipher: b"new".to_vec(),
            aad: vec![],
            hash_hex: "new".into(),
            deleted: false,
        };

        let merged = apply_ops(&BTreeMap::new(), &[new.clone(), old]).unwrap();
        assert_eq!(merged.get("entry").unwrap().encrypted_payload, new.cipher);
    }
}

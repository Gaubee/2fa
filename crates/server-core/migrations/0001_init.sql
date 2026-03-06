CREATE TABLE IF NOT EXISTS challenges (
  nonce TEXT PRIMARY KEY,
  public_key_hint TEXT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_accounts (
  public_key_hex TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  write_enabled_until_ms BIGINT NOT NULL,
  archive_until_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  public_key_hex TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  write_enabled_until_ms BIGINT NOT NULL,
  archive_until_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS vaults (
  vault_id TEXT PRIMARY KEY,
  public_key_hex TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_ops (
  op_id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  wall_ms BIGINT NOT NULL,
  hlc_counter BIGINT NOT NULL,
  node_id TEXT NOT NULL,
  cipher_b64 TEXT NOT NULL,
  aad_b64 TEXT NOT NULL,
  hash_hex TEXT NOT NULL,
  deleted BOOLEAN NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_ops_vault_id ON vault_ops (vault_id, wall_ms, hlc_counter);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_billing_policy (
  id BIGINT PRIMARY KEY,
  cloud_1k_annual_usd BIGINT NOT NULL,
  cloud_1k_annual_cny BIGINT NOT NULL,
  grace_days BIGINT NOT NULL,
  readonly_days BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);

INSERT INTO admin_billing_policy (id, cloud_1k_annual_usd, cloud_1k_annual_cny, grace_days, readonly_days, updated_at_ms)
SELECT 1, 1, 7, 30, 365, 0
WHERE NOT EXISTS (SELECT 1 FROM admin_billing_policy WHERE id = 1);

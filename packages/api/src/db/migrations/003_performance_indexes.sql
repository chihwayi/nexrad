-- ── Migration 003: Performance Indexes ───────────────────────────────────────
-- Run AFTER initial data is loaded for best index build performance

-- radacct: most common query patterns
ALTER TABLE radacct
  ADD INDEX IF NOT EXISTS idx_radacct_active (acctstoptime, nasipaddress),
  ADD INDEX IF NOT EXISTS idx_radacct_user_start (username, acctstarttime);

-- userbillinfo: join pattern
ALTER TABLE userbillinfo
  ADD INDEX IF NOT EXISTS idx_ubi_creationby_date (creationby, creationdate),
  ADD INDEX IF NOT EXISTS idx_ubi_planname (planName);

-- nx_tokens: common filters
ALTER TABLE nx_tokens
  ADD INDEX IF NOT EXISTS idx_tokens_org_created (org_id, created_at),
  ADD INDEX IF NOT EXISTS idx_tokens_expires (expires_at);

-- nx_audit_log: recent entries lookup
ALTER TABLE nx_audit_log
  ADD INDEX IF NOT EXISTS idx_audit_org_created (org_id, created_at),
  ADD INDEX IF NOT EXISTS idx_audit_action (action);

-- nx_api_keys: fast key lookup (already has key_hash via UNIQUE — verify)
-- Only add if not already there:
CREATE INDEX IF NOT EXISTS idx_apikey_hash ON nx_api_keys (key_hash(32));

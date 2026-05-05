-- ── Migration 003: Performance Indexes ───────────────────────────────────────
-- Run AFTER initial data is loaded for best index build performance

-- radacct: most common query patterns
CREATE INDEX idx_radacct_active ON radacct (acctstoptime, nasipaddress);
CREATE INDEX idx_radacct_user_start ON radacct (username, acctstarttime);

-- userbillinfo: join pattern
CREATE INDEX idx_ubi_creationby_date ON userbillinfo (creationby, creationdate);
CREATE INDEX idx_ubi_planname ON userbillinfo (planName);

-- nx_tokens: common filters
CREATE INDEX idx_tokens_org_created ON nx_tokens (org_id, created_at);
CREATE INDEX idx_tokens_expires ON nx_tokens (expires_at);

-- nx_audit_log: recent entries lookup
CREATE INDEX idx_audit_org_created ON nx_audit_log (org_id, created_at);
CREATE INDEX idx_audit_action ON nx_audit_log (action);

-- nx_api_keys: fast key lookup
CREATE INDEX idx_apikey_hash ON nx_api_keys (key_hash(32));

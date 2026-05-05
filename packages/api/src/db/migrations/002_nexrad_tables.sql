-- ── Migration 002: NexRAD application tables ──────────────────────────────────
-- These are NexRAD-specific tables that sit alongside FreeRADIUS tables.
-- All table names are prefixed nx_ to avoid collisions.

CREATE TABLE IF NOT EXISTS nx_organizations (
  id              INT NOT NULL AUTO_INCREMENT,
  name            VARCHAR(100) NOT NULL,
  slug            VARCHAR(50) NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.10,
  logo_url        VARCHAR(255),
  currency        VARCHAR(3)  NOT NULL DEFAULT 'USD',
  timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
  voucher_footer  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default organization (for single-tenant deployments)
INSERT IGNORE INTO nx_organizations (id, name, slug, commission_rate)
VALUES (1, 'Default Organization', 'default', 0.10);

CREATE TABLE IF NOT EXISTS nx_users (
  id          INT NOT NULL AUTO_INCREMENT,
  org_id      INT,
  username    VARCHAR(50) NOT NULL,
  email       VARCHAR(100),
  password    VARCHAR(255) NOT NULL,
  role        ENUM('superadmin','orgadmin','branchmanager','operator','readonly') NOT NULL DEFAULT 'operator',
  branch_ip   VARCHAR(45),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  last_login  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY username (username),
  KEY org_id (org_id),
  CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES nx_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nx_branches (
  id          INT NOT NULL AUTO_INCREMENT,
  org_id      INT NOT NULL,
  nas_ip      VARCHAR(45) NOT NULL,
  shortname   VARCHAR(50) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  location    VARCHAR(255),
  wg_pubkey   VARCHAR(255),
  wg_endpoint VARCHAR(100),
  tunnel_ip   VARCHAR(45),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY nas_ip (nas_ip),
  KEY org_id (org_id),
  CONSTRAINT fk_branch_org FOREIGN KEY (org_id) REFERENCES nx_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nx_billing_plans (
  id              INT NOT NULL AUTO_INCREMENT,
  org_id          INT NOT NULL,
  name            VARCHAR(100) NOT NULL,
  display_name    VARCHAR(100),
  time_bank_hours INT NOT NULL,
  data_limit_mb   INT,
  cost            DECIMAL(10,2) NOT NULL,
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
  fr_group_name   VARCHAR(64),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY org_id (org_id),
  CONSTRAINT fk_plan_org FOREIGN KEY (org_id) REFERENCES nx_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nx_tokens (
  id          INT NOT NULL AUTO_INCREMENT,
  org_id      INT NOT NULL,
  username    VARCHAR(64) NOT NULL,
  branch_id   INT,
  plan_id     INT,
  prefix      VARCHAR(10),
  batch_id    CHAR(36),
  created_by  INT,
  expires_at  DATETIME,
  notes       VARCHAR(255),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY username (username),
  KEY batch_id (batch_id),
  KEY org_id (org_id),
  KEY branch_id (branch_id),
  CONSTRAINT fk_token_org    FOREIGN KEY (org_id)     REFERENCES nx_organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_token_branch FOREIGN KEY (branch_id)  REFERENCES nx_branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_token_plan   FOREIGN KEY (plan_id)    REFERENCES nx_billing_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_token_user   FOREIGN KEY (created_by) REFERENCES nx_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nx_refresh_tokens (
  id          INT NOT NULL AUTO_INCREMENT,
  user_id     INT NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  DATETIME NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY user_id (user_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES nx_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nx_audit_log (
  id          BIGINT NOT NULL AUTO_INCREMENT,
  org_id      INT,
  user_id     INT,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(50),
  resource_id VARCHAR(100),
  meta        JSON,
  ip_address  VARCHAR(45),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY org_id (org_id),
  KEY user_id (user_id),
  KEY created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nx_api_keys (
  id          INT NOT NULL AUTO_INCREMENT,
  org_id      INT NOT NULL,
  name        VARCHAR(100) NOT NULL,
  key_hash    VARCHAR(255) NOT NULL,
  key_prefix  VARCHAR(10) NOT NULL,
  scopes      JSON,
  last_used   DATETIME,
  expires_at  DATETIME,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  INT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY key_prefix (key_prefix),
  KEY org_id (org_id),
  CONSTRAINT fk_apikey_org  FOREIGN KEY (org_id)     REFERENCES nx_organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_apikey_user FOREIGN KEY (created_by) REFERENCES nx_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Password: 'admin123' (bcrypt, cost 12) — CHANGE IN PRODUCTION
INSERT IGNORE INTO nx_users (id, org_id, username, email, password, role)
VALUES (
  1, NULL, 'superadmin', 'admin@nexrad.io',
  '$2b$12$1Vgb8jO2O14Uowto2ooMzeTeNS6mSpAPnH4ehGusiel5T1TWcWZIS',
  'superadmin'
);

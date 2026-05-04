-- ── Migration 001: FreeRADIUS compatibility tables ────────────────────────────
-- These tables are the standard FreeRADIUS MySQL schema.
-- NexRAD reads/writes these directly to stay 100% compatible with FreeRADIUS.
-- If these tables already exist (existing deployment), this migration is safe
-- to run — all statements use CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS radcheck (
  id          INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username    VARCHAR(64) NOT NULL DEFAULT '',
  attribute   VARCHAR(64) NOT NULL DEFAULT '',
  op          CHAR(2) NOT NULL DEFAULT '==',
  value       VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY username (username(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS radreply (
  id          INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  username    VARCHAR(64) NOT NULL DEFAULT '',
  attribute   VARCHAR(64) NOT NULL DEFAULT '',
  op          CHAR(2) NOT NULL DEFAULT '=',
  value       VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY username (username(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS radgroupcheck (
  id          INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  groupname   VARCHAR(64) NOT NULL DEFAULT '',
  attribute   VARCHAR(64) NOT NULL DEFAULT '',
  op          CHAR(2) NOT NULL DEFAULT '==',
  value       VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY groupname (groupname(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS radgroupreply (
  id          INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  groupname   VARCHAR(64) NOT NULL DEFAULT '',
  attribute   VARCHAR(64) NOT NULL DEFAULT '',
  op          CHAR(2) NOT NULL DEFAULT '=',
  value       VARCHAR(253) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY groupname (groupname(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS radusergroup (
  username    VARCHAR(64) NOT NULL DEFAULT '',
  groupname   VARCHAR(64) NOT NULL DEFAULT '',
  priority    INT(11) NOT NULL DEFAULT 1,
  KEY username (username(32))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS radacct (
  radacctid          BIGINT(21) NOT NULL AUTO_INCREMENT,
  acctsessionid      VARCHAR(64) NOT NULL DEFAULT '',
  acctuniqueid       VARCHAR(32) NOT NULL DEFAULT '',
  username           VARCHAR(64) NOT NULL DEFAULT '',
  groupname          VARCHAR(64) NOT NULL DEFAULT '',
  realm              VARCHAR(64) DEFAULT '',
  nasipaddress       VARCHAR(15) NOT NULL DEFAULT '',
  nasportid          VARCHAR(15) DEFAULT NULL,
  nasporttype        VARCHAR(32) DEFAULT NULL,
  acctstarttime      DATETIME DEFAULT NULL,
  acctupdatetime     DATETIME DEFAULT NULL,
  acctstoptime       DATETIME DEFAULT NULL,
  acctinterval       INT(12) DEFAULT NULL,
  acctsessiontime    INT(12) UNSIGNED DEFAULT NULL,
  acctauthentic      VARCHAR(32) DEFAULT NULL,
  connectinfo_start  VARCHAR(50) DEFAULT NULL,
  connectinfo_stop   VARCHAR(50) DEFAULT NULL,
  acctinputoctets    BIGINT(20) DEFAULT NULL,
  acctoutputoctets   BIGINT(20) DEFAULT NULL,
  calledstationid    VARCHAR(50) NOT NULL DEFAULT '',
  callingstationid   VARCHAR(50) NOT NULL DEFAULT '',
  acctterminatecause VARCHAR(32) NOT NULL DEFAULT '',
  servicetype        VARCHAR(32) DEFAULT NULL,
  framedprotocol     VARCHAR(32) DEFAULT NULL,
  framedipaddress    VARCHAR(15) NOT NULL DEFAULT '',
  PRIMARY KEY (radacctid),
  UNIQUE KEY acctuniqueid (acctuniqueid),
  KEY username (username),
  KEY nasipaddress (nasipaddress),
  KEY acctstarttime (acctstarttime),
  KEY acctstoptime (acctstoptime),
  KEY acctinterval (acctinterval)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nas (
  id          INT(10) NOT NULL AUTO_INCREMENT,
  nasname     VARCHAR(128) NOT NULL,
  shortname   VARCHAR(32),
  type        VARCHAR(30) DEFAULT 'other',
  ports       INT(5),
  secret      VARCHAR(60) NOT NULL DEFAULT 'secret',
  server      VARCHAR(64),
  community   VARCHAR(50),
  description VARCHAR(200) DEFAULT 'RADIUS Client',
  PRIMARY KEY (id),
  KEY nasname (nasname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Legacy daloRADIUS tables (kept for migration compatibility)
CREATE TABLE IF NOT EXISTS billing_plans (
  planId        INT(11) NOT NULL AUTO_INCREMENT,
  planName      VARCHAR(50) DEFAULT NULL,
  planCost      DECIMAL(12,4) DEFAULT NULL,
  planCurrency  VARCHAR(10) DEFAULT 'USD',
  planTimeBank  INT(11) DEFAULT NULL,
  planBandwidth INT(11) DEFAULT NULL,
  planLimits    VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (planId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS userbillinfo (
  username      VARCHAR(64) NOT NULL DEFAULT '',
  planName      VARCHAR(50) DEFAULT NULL,
  creationdate  DATETIME DEFAULT NULL,
  creationby    VARCHAR(50) DEFAULT NULL,
  expiration    VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

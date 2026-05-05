-- Add provisioning columns to nx_branches
ALTER TABLE nx_branches
  ADD COLUMN radius_secret VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN reg_token     VARCHAR(64) NULL DEFAULT NULL;

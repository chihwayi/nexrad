#!/usr/bin/env bash
set -e
source .env
echo "Running migrations..."
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/001_freeradius_compat.sql
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/002_nexrad_tables.sql
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
  < packages/api/src/db/migrations/003_performance_indexes.sql
echo "Migrations complete."

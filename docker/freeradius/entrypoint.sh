#!/bin/sh
set -e

# Substitute environment variables into FreeRADIUS SQL module config
envsubst < /etc/freeradius/3.0/mods-available/sql \
         > /tmp/sql.conf
cp /tmp/sql.conf /etc/freeradius/3.0/mods-available/sql

exec "$@"

# Production Deployment Guide

## 1. Server Requirements

- Ubuntu 22.04+ (or Debian 12+)
- 2 vCPU, 2 GB RAM minimum (4 GB recommended)
- 20 GB SSD
- Docker + Docker Compose installed
- WireGuard installed (if using VPN branches)

## 2. DNS & SSL

Point your domain to the server IP, then:

```bash
apt install certbot
certbot certonly --standalone -d yourdomain.com
```

Certificates land in `/etc/letsencrypt/live/yourdomain.com/`.

## 3. Environment Setup

```bash
git clone https://github.com/YOUR_ORG/nexrad.git /opt/nexrad
cd /opt/nexrad
cp .env.example .env
```

Edit `.env` — critical values:

- `JWT_SECRET` — random 64-char string (`openssl rand -hex 32`)
- `REFRESH_TOKEN_SECRET` — different random 64-char string
- `DB_ROOT_PASSWORD`, `DB_PASSWORD` — strong passwords
- `REDIS_PASSWORD` — strong password
- `DOMAIN` — your domain (e.g. nexrad.yourdomain.com)
- `WG_SERVER_ENDPOINT` — your server's public IP or domain
- `SMTP_*` — email credentials (optional)

## 4. WireGuard Setup (if using VPN branches)

```bash
apt install wireguard
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
chmod 600 /etc/wireguard/server_private.key

cat > /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = $(cat /etc/wireguard/server_private.key)
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
EOF

systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0
```

Set `WG_CONFIG_PATH=/etc/wireguard/wg0.conf` in `.env`.

## 5. Database Migrations

```bash
# First run — migrations are applied via docker-entrypoint-initdb.d automatically
# For subsequent runs:
docker compose -f docker-compose.prod.yml exec mysql \
  mysql -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} \
  < packages/api/src/db/migrations/003_performance_indexes.sql
```

## 6. Start Production Stack

```bash
cd /opt/nexrad
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f api
```

## 7. First Login

1. Navigate to `https://yourdomain.com`
2. Login with `admin` / `admin123`
3. **Immediately change the admin password** in Users → Edit
4. Create your organization in Org Settings
5. Add branches in Branches → Add Branch

## 8. Backups

```bash
# MySQL backup (add to cron)
docker compose -f docker-compose.prod.yml exec mysql \
  mysqldump -u${DB_USER} -p${DB_PASSWORD} ${DB_NAME} \
  | gzip > /backups/nexrad-$(date +%Y%m%d).sql.gz

# Retention: keep last 30 days
find /backups -name "nexrad-*.sql.gz" -mtime +30 -delete
```

## 9. Updates

```bash
cd /opt/nexrad
git pull
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

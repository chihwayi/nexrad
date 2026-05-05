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

## 5. FreeRADIUS Setup

FreeRADIUS runs as a Docker container alongside the API. It connects to the same MySQL database and reads authentication data from the standard FreeRADIUS schema tables (`radcheck`, `radgroupreply`, etc.) that NexRAD manages.

**Add to `.env`:**

```bash
# Fallback RADIUS shared secret for WireGuard tunnel range (10.8.0.0/24).
# Per-branch secrets are stored in the `nas` table and take precedence.
RADIUS_DEFAULT_SECRET=your-strong-radius-secret
```

FreeRADIUS loads NAS clients directly from the `nas` MySQL table (`read_clients = yes`), so each branch's per-branch RADIUS secret (set by NexRAD on branch creation) is automatically picked up — no manual FreeRADIUS config per branch.

**Open firewall ports:**

```bash
ufw allow 1812/udp   # RADIUS authentication
ufw allow 1813/udp   # RADIUS accounting
ufw allow 51820/udp  # WireGuard
```

## 6. Start Production Stack

```bash
cd /opt/nexrad
docker compose -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f freeradius
```

## 7. First Login & Branch Setup

1. Navigate to `https://yourdomain.com`
2. Login with `superadmin` / `admin123` — **immediately change this password**
3. Go to **Branches → Add Branch** — fill in name, shortname, location
4. Click the branch row → **Download .rsc** (RouterOS provisioning script)
5. Upload the `.rsc` to MikroTik via **Files**, then run it in **Terminal**: `/import file=provision-branch.rsc`
6. The MikroTik will set up WireGuard, configure RADIUS, and call back to register its public key automatically
7. Branch status changes to **Active** in the UI once registration completes

**MikroTik requirements:**

- RouterOS 7.1+ (WireGuard support)
- The MikroTik must have internet access to reach your server on port 443 (HTTPS for registration callback) and 51820/udp (WireGuard)
- After WireGuard tunnel is up, RADIUS traffic flows on 10.8.0.x → server:1812/udp

## 8. Generate WiFi Tokens

1. In NexRAD: **Plans → Add Plan** — set name, duration, data cap, price
2. **Tokens → Generate** — choose plan, quantity, optional prefix
3. **Print vouchers** as PDF — each voucher shows the username/password (same value for hotspot tokens)
4. On MikroTik: the hotspot is pre-configured by the `.rsc` script. Clients connect to WiFi, get redirected to the hotspot login page, enter the token code as both username and password

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

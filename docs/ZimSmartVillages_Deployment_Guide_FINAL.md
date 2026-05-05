# ZimSmartVillages WiFi Hotspot Deployment Manual

**MikroTik RB951 · RouterOS 7.22.2 · WireGuard VPN · FreeRADIUS**  
_Complete Step-by-Step Guide for Field Deployers — No prior networking experience required_

> **Estimated Time per Router: 35–40 minutes**  
> **Central Server IP: 173.212.195.88**  
> **WiFi Name: ZimSmartVillages (same on every router)**

---

## How to Use This Guide

This manual walks you through every single step needed to set up a ZimSmartVillages WiFi hotspot. It is written for deployers who may never have configured a network device before. **Follow every step in order — do not skip ahead.**

> ⚠️ **READ BEFORE YOU START**
>
> This guide has **three parts** that require two different connections:
>
> - **Part A (Steps 1–8):** Work done ON the MikroTik router (you connect to it locally)
> - **Part B (Steps 9–10):** Work done ON the central server (173.212.195.88) via SSH
> - **Part C (Steps 11–13):** Back on the MikroTik to finish RADIUS config and test
>
> You will go back and forth once between the router and the server. This is normal.

---

### What This Setup Does

Every router you configure will:

- Broadcast an open WiFi network called **ZimSmartVillages**
- Redirect any user who connects to a login page asking for a voucher code
- Send that voucher to the central server (173.212.195.88) to check if it is valid
- Use a secure **WireGuard VPN tunnel** to talk to the server (so the internet IP of the router does not matter)
- **Remember devices** — once a user logs in, they stay logged in even after power cuts or WiFi disconnects

---

### Before You Arrive on Site — Fill This In

Fill in the table below **BEFORE you start**. Every router gets different values for items marked with \*.

| Field               | Your Value                                                    |
| ------------------- | ------------------------------------------------------------- |
| Branch Number \*    | e.g. 01, 02, 03 …                                             |
| Location Name \*    | e.g. Harare-CBD, Bulawayo, Mutare                             |
| Router Identity \*  | Branch01-Harare-CBD _(format: Branch[XX]-[Location])_         |
| WireGuard VPN IP \* | 10.8.0.\_\_ _(Branch 01=.11, Branch 02=.12, Branch 03=.13 …)_ |
| RADIUS Secret \*    | Branch1Secret! _(format: Branch[N]Secret!)_                   |
| WiFi SSID           | ZimSmartVillages _(SAME on every router — do not change)_     |
| Admin Password \*   | Choose a strong password — write it here                      |
| MikroTik Public Key | _(leave blank — you will fill this in Step 8)_                |
| Deployment Date     |                                                               |
| Deployed By         |                                                               |

> 🟠 **VPN IP ASSIGNMENT RULE**
>
> The formula is: **VPN IP last number = Branch Number + 10**
>
> | Branch | VPN IP    | Branch | VPN IP    |
> | ------ | --------- | ------ | --------- |
> | 01     | 10.8.0.11 | 06     | 10.8.0.16 |
> | 02     | 10.8.0.12 | 07     | 10.8.0.17 |
> | 03     | 10.8.0.13 | 08     | 10.8.0.18 |
> | 04     | 10.8.0.14 | 09     | 10.8.0.19 |
> | 05     | 10.8.0.15 | 10     | 10.8.0.20 |
>
> **EVERY router must have a UNIQUE VPN IP. Double-check before proceeding.**

---

# PART A — MIKROTIK ROUTER CONFIGURATION

_In this part you will configure the MikroTik router itself. You must be physically connected to the router via Ethernet cable._

---

## STEP 1 — Connect to the Router _(~5 min)_

You need a Windows laptop with WinBox installed, OR any computer connected by Ethernet.

### Option A — Connect via WinBox (Recommended)

1. Plug an Ethernet cable from your laptop into **any port on the MikroTik EXCEPT Port 1** (Port 1 is reserved for Starlink/internet).
2. Open WinBox on your laptop.
3. Click the **"…" (three dots)** button next to the "Connect To" field.
4. Click the **Neighbors** tab. Wait a few seconds — the router will appear in the list.
5. Click on the router in the list. The MAC address fills automatically.
6. **Username:** `admin` **Password:** _(leave completely blank)_
7. Click **Connect**.

### Option B — Connect via Web Browser

1. Open any web browser (Chrome, Firefox, Edge).
2. Go to: **http://192.168.88.1**
3. **Username:** `admin` **Password:** _(leave blank)_

> ℹ️ **What you see:** A WinBox window or web page showing the router dashboard. You are now inside the router.
>
> To type commands: In WinBox click **"New Terminal"** on the left side. In WebFig click **"Terminal"** in the left menu.

---

## STEP 2 — Reset to Factory Defaults _(~3 min)_

> ⚠️ **If this router has NEVER been used before (brand new or fresh from Netinstall), skip to Step 3.**  
> If it was previously configured for something else — do this reset.

> 🔴 **IMPORTANT — Use this exact reset command, not the one you may have seen elsewhere**
>
> Most guides tell you to use `no-defaults=yes`. **Do NOT use that on the RB951.**
>
> The RB951 has a built-in hardware switch chip (Atheros). When you reset with `no-defaults=yes`,
> the chip boots in an uninitialised state. Any bridge you then create in software conflicts
> with the hardware chip's own internal switching fabric, causing you to be kicked out of
> WinBox every time you move a port — even before you touch your own cable port.
>
> The correct reset keeps the factory defaults so the hardware chip initialises properly.
> You then modify the existing config rather than building from zero.

Paste this command into the terminal and press Enter:

```
/system reset-configuration skip-backup=yes
```

The router will ask **"Dangerous! Reset anyway?"** — type `y` and press Enter.

The router will reboot with factory defaults. **Wait 2–3 minutes**, then reconnect:

- WinBox Neighbors tab, OR
- Connect To: `192.168.88.1` — username: `admin` — password: _(blank)_

---

## STEP 3 — Set Password & Router Identity _(~3 min)_

> 🔴 **CRITICAL — DO THIS FIRST**  
> Set the admin password immediately. An unsecured router is a security risk.  
> Replace `YourSecurePassword123!` with YOUR chosen password from your prep sheet.  
> Replace `Branch01-Harare-CBD` with YOUR Router Identity from your prep sheet.

Copy these **TWO commands** into the terminal (change the values shown):

```
/user set admin password=YourSecurePassword123!
/system identity set name=Branch01-Harare-CBD
```

Verify your identity was set:

```
/system identity print
```

It should show: `name: Branch01-Harare-CBD`

---

## STEP 4 — Configure WiFi (2.4 GHz) _(~3 min)_

The RB951 uses the `wireless` package (not `wifi` or `wifi6`). Run the commands below exactly as shown.

### 4.1 — Check your wireless interface name first

```
/interface wireless print
```

You should see `wlan1` in the list. If you see a different name, replace `wlan1` in all commands below with that name.

### 4.2 — Configure the WiFi radio

```
/interface wireless set wlan1 \
  mode=ap-bridge \
  ssid="ZimSmartVillages" \
  band=2ghz-b/g/n \
  channel-width=20/40mhz-Ce \
  frequency=auto \
  country=zimbabwe \
  installation=indoor \
  disabled=no
```

### 4.3 — Remove any WiFi password (the hotspot portal controls access, not the WiFi itself)

```
/interface wireless security-profiles set [ find default=yes ] \
  mode=none \
  authentication-types=""
/interface wireless set wlan1 security-profile=default
```

### 4.4 — Verify WiFi is working

```
/interface wireless print
```

You should see `wlan1` with `disabled=no` and `ssid="ZimSmartVillages"`.

---

## STEP 5 — Configure Bridge, IP Address & DHCP _(~8 min)_

A "bridge" joins WiFi and all LAN ports together so every user — wired or wireless — ends up on the same hotspot network.

### 5.1 — Check what you have right now (MANDATORY — determines which path you take)

```
/interface bridge print
/interface bridge port print
/ip address print
```

**Read the output carefully. You will be in one of two situations:**

> 🔵 **SITUATION A — Output is blank / empty (no bridges listed)**
>
> This happens after a Netinstall, or if the factory startup script did not run.
> The hardware switch chip is in a clean uninitialised state.
> There is nothing to migrate — you build everything fresh.
> **→ Follow PATH A below (Step 5.2A)**

> 🟢 **SITUATION B — You see an existing bridge (bridge or bridge1) with ports in it**
>
> This is the normal result after `/system reset-configuration skip-backup=yes`.
> The hardware switch chip is already correctly initialised.
> You migrate ports from the existing bridge to the new one — never destroying first.
> **→ Follow PATH B below (Step 5.2B)**

---

### PATH A — Blank Slate (no existing bridge)

> Use this path if `/interface bridge print` showed nothing at all.

**5.2A — Create bridge-hotspot, assign IP, and set up DHCP all at once**

Since there is no old bridge fighting you, and no ports in any bridge, you can safely add all ports in one go. Paste this entire block:

```
/interface bridge add name=bridge-hotspot comment="Hotspot Network"
/ip address add address=10.10.10.1/24 interface=bridge-hotspot comment="Hotspot Gateway"
/ip pool add name=hotspot-pool ranges=10.10.10.10-10.10.10.254
/ip dhcp-server network add \
  address=10.10.10.0/24 \
  gateway=10.10.10.1 \
  dns-server=1.1.1.1,8.8.8.8 \
  comment="Hotspot Network"
/ip dhcp-server add \
  name=hotspot-dhcp \
  interface=bridge-hotspot \
  address-pool=hotspot-pool \
  disabled=no \
  lease-time=1h
```

**Verify DHCP is running before adding ports:**

```
/ip dhcp-server print
```

Should show `hotspot-dhcp` with no X flag. Good.

**5.3A — Add wlan1 and all ether ports to bridge-hotspot**

```
/interface bridge port add interface=wlan1 bridge=bridge-hotspot
/interface bridge port add interface=ether2 bridge=bridge-hotspot
/interface bridge port add interface=ether3 bridge=bridge-hotspot
/interface bridge port add interface=ether4 bridge=bridge-hotspot
/interface bridge port add interface=ether5 bridge=bridge-hotspot
```

> ⚠️ **You will disconnect briefly when your laptop's ether port gets added** (usually ether2). WinBox freezes for 3–5 seconds. Your laptop requests a new IP — `bridge-hotspot` DHCP answers and gives it `10.10.10.x`. Reconnect via:
>
> - WinBox → `...` → **Neighbors tab** → router appears → click → login ✅
> - OR: WinBox Connect To: `10.10.10.1` → `admin` → your password ✅

**Now skip to Step 5.7 to verify.**

---

### PATH B — Existing Bridge Present (normal factory reset result)

> Use this path if `/interface bridge print` showed an existing bridge with ports.

> ✅ **Why this method works:** The hardware switch chip is already initialised by the existing bridge. We build `bridge-hotspot` alongside it, start DHCP on it first, then migrate ports one by one. The chip stays happy the whole time. You get one brief reconnect when your own port moves — that is all.

**Note which ether port your laptop cable is in** — look at the back of the router and count. In WinBox Interface list it shows `R` (Running). **Write it down — you need this for Step 5.5B.**

**5.2B — Create bridge-hotspot + IP + DHCP all at once (before touching any ports)**

```
/interface bridge add name=bridge-hotspot comment="Hotspot Network"
/ip address add address=10.10.10.1/24 interface=bridge-hotspot comment="Hotspot Gateway"
/ip pool add name=hotspot-pool ranges=10.10.10.10-10.10.10.254
/ip dhcp-server network add \
  address=10.10.10.0/24 \
  gateway=10.10.10.1 \
  dns-server=1.1.1.1,8.8.8.8 \
  comment="Hotspot Network"
/ip dhcp-server add \
  name=hotspot-dhcp \
  interface=bridge-hotspot \
  address-pool=hotspot-pool \
  disabled=no \
  lease-time=1h
```

**Verify DHCP is running before moving any ports:**

```
/ip dhcp-server print
```

Should show `hotspot-dhcp` with no X flag. Good.

**5.3B — Add wlan1 to bridge-hotspot (WiFi — always safe)**

```
/interface bridge port add interface=wlan1 bridge=bridge-hotspot
```

**5.4B — Move all ether ports EXCEPT your laptop's port**

The example below assumes your laptop is in **ether2** — skip ether2, move the rest:

```
/interface bridge port remove [find interface=ether3]
/interface bridge port add interface=ether3 bridge=bridge-hotspot

/interface bridge port remove [find interface=ether4]
/interface bridge port add interface=ether4 bridge=bridge-hotspot

/interface bridge port remove [find interface=ether5]
/interface bridge port add interface=ether5 bridge=bridge-hotspot
```

> ⚠️ Adjust based on your actual laptop port. If your laptop is in ether3, skip ether3 and move ether2 instead. Rule: move every port EXCEPT the one your cable is physically in.

**5.5B — Move YOUR laptop's port LAST (3–5 second disconnect — reconnect immediately)**

Replace `ether2` with your actual port:

```
/interface bridge port remove [find interface=ether2]
/interface bridge port add interface=ether2 bridge=bridge-hotspot
```

> WinBox freezes 3–5 seconds. Laptop gets `10.10.10.x` from `bridge-hotspot` DHCP.
> Reconnect via Neighbors tab or WinBox Connect To: `10.10.10.1`

**5.6B — Remove the old bridge (now empty, safe to delete)**

```
/interface bridge remove [find name!=bridge-hotspot]
/ip address remove [find interface=bridge]
/ip address remove [find interface=bridge1]
/ip address remove [find invalid]
/ip dhcp-server remove [find interface!=bridge-hotspot]
/ip dhcp-client remove [find interface=bridge]
/ip dhcp-client remove [find interface=bridge1]
```

> "No such item" errors are fine — means nothing left to remove.

---

### 5.7 — Verify everything is correct (BOTH paths meet here)

```
/interface bridge print
/interface bridge port print
/ip address print
/ip dhcp-server print
```

**You should see:**

- One bridge: `bridge-hotspot` — R flag (Running), no X flag
- Ports: `wlan1`, `ether2`, `ether3`, `ether4`, `ether5` — all in `bridge-hotspot`
- `ether1` NOT in the bridge (stays separate for Starlink)
- IP: `10.10.10.1/24` on `bridge-hotspot` — no INVALID flag
- DHCP: `hotspot-dhcp` running on `bridge-hotspot` — no X flag

> ℹ️ **The `I` (INACTIVE) flag on bridge ports is normal at this stage.** It means no traffic has flowed through that port yet. It clears when devices connect. It is NOT an error. Continue to Step 6.

---

## STEP 6 — Connect to Internet (Starlink) _(~5 min)_

The Starlink dish must be plugged into **ether1** on the MikroTik before this step.

### 6.1 — Check if internet DHCP is already working

```
/ip dhcp-client print
```

If you see `ether1` with `status=bound` — great! **Skip to Step 6.3.**

If you do NOT see ether1, add it now:

```
/ip dhcp-client add \
  interface=ether1 \
  disabled=no \
  use-peer-dns=yes \
  use-peer-ntp=yes \
  add-default-route=yes \
  comment="Starlink WAN"
```

### 6.2 — Wait 15 seconds then check again

```
/ip dhcp-client print
```

You should now see `status=bound` on `ether1`.

### 6.3 — Test internet connectivity

```
/ping 8.8.8.8 count=5
```

You should see 5 replies. If ping fails: check the Starlink dish is powered on and the cable is in ether1.

### 6.4 — Configure NAT and Firewall

> ⚠️ **CRITICAL — Firewall rule ORDER matters**
>
> RouterOS applies firewall rules from top to bottom and stops at the first match. The rules below are in the **exact correct order**. If the "drop all" rule appears before the "allow" rules, traffic will be blocked. Copy and paste the entire block below at once — do not paste rules one at a time from a previous session.
>
> First, clear any existing firewall rules to start clean:

```
/ip firewall filter remove [find]
/ip firewall nat remove [find]
/ip firewall mangle remove [find]
```

> Now add all the rules in the correct order (copy-paste the whole block at once):

```
/ip firewall nat add \
  chain=srcnat \
  out-interface=ether1 \
  action=masquerade \
  comment="Masquerade to WAN"

/ip firewall filter add \
  chain=input \
  connection-state=established,related \
  action=accept \
  comment="Allow established input"

/ip firewall filter add \
  chain=input \
  protocol=icmp \
  action=accept \
  comment="Allow ICMP"

/ip firewall filter add \
  chain=input \
  in-interface=bridge-hotspot \
  action=accept \
  comment="Allow from LAN"

/ip firewall filter add \
  chain=forward \
  connection-state=established,related \
  action=fasttrack-connection \
  comment="FastTrack for speed"

/ip firewall filter add \
  chain=forward \
  connection-state=established,related \
  action=accept \
  comment="Allow established forward"

/ip firewall filter add \
  chain=forward \
  in-interface=bridge-hotspot \
  out-interface=ether1 \
  action=accept \
  comment="Hotspot to Internet"

/ip firewall filter add \
  chain=forward \
  connection-state=invalid \
  action=drop \
  comment="Drop invalid"

/ip firewall filter add \
  chain=input \
  action=drop \
  comment="Drop all other input"

/ip firewall mangle add \
  chain=forward \
  protocol=tcp \
  tcp-flags=syn \
  action=change-mss \
  new-mss=1340 \
  comment="Optimize VPN MTU"
```

> Verify the rules were added in the correct order:

```
/ip firewall filter print
```

> The **drop rules must appear LAST** in the list. If they appear before the accept rules, traffic will be blocked and internet will not work.

---

## STEP 7 — Create Hotspot Server (with Persistent Sessions) _(~5 min)_

> ✅ **KEY FEATURE — PERSISTENT SESSIONS**
> Once a user enters their voucher, they stay logged in even after power cuts or WiFi drops.
> They will NOT be asked to log in again on the same device.

> ℹ️ **Two important settings explained:**
>
> **`login-by=http-pap,cookie`** — The `cookie` method is what makes persistent sessions work.
> When a device reconnects, RouterOS checks for a stored cookie and logs the user back in
> automatically without showing the login page. Without `cookie` here, persistent sessions
> are broken — the login page shows every single reconnect.
>
> **`html-directory=""`** — Setting this to empty tells RouterOS to use its **built-in internal
> hotspot login pages** which always exist on every RouterOS installation. If you set
> `html-directory=hotspot` (as older guides do), RouterOS looks for HTML files in a folder
> called `hotspot` in the router's file system — but on RouterOS 7.x clean/Netinstall
> builds this folder is empty, causing a **404 error** when the captive portal loads.
> Use empty string unless you have custom pages uploaded.

### 7.1 — Create hotspot profile

```
/ip hotspot profile add \
  name=custom-hotspot \
  login-by=http-pap,cookie \
  use-radius=yes \
  radius-accounting=yes \
  radius-interim-update=5m \
  html-directory="" \
  http-proxy=0.0.0.0:0
```

### 7.2 — Create user profile with persistent sessions

```
/ip hotspot user profile add \
  name=default-hotspot \
  shared-users=unlimited \
  rate-limit="" \
  keepalive-timeout=none \
  idle-timeout=none \
  session-timeout=0 \
  transparent-proxy=no \
  add-mac-cookie=yes
```

### 7.3 — Create and enable the hotspot server

```
/ip hotspot add \
  name=hotspot1 \
  interface=bridge-hotspot \
  address-pool=hotspot-pool \
  profile=custom-hotspot \
  addresses-per-mac=2 \
  keepalive-timeout=none \
  idle-timeout=none
/ip hotspot enable hotspot1
```

### 7.4 — Verify hotspot is running

```
/ip hotspot print
/ip hotspot profile print
```

Confirm `hotspot1` has NO X flag (enabled ✓). Confirm `custom-hotspot` shows `login-by=http-pap,cookie` and `use-radius=yes`.

> ⚠️ **If you already created the hotspot profile with wrong settings, fix it now:**
>
> ```
> /ip hotspot profile set custom-hotspot login-by=http-pap,cookie
> /ip hotspot profile set custom-hotspot html-directory=""
> /ip hotspot disable hotspot1
> /ip hotspot enable hotspot1
> ```

---

## STEP 8 — Create WireGuard VPN Tunnel _(~5 min)_

WireGuard creates a secure, encrypted tunnel between this router and the central server. This is how the router talks to RADIUS even if its public internet IP changes.

### 8.1 — Create the WireGuard interface

```
/interface wireguard add name=wg-radius listen-port=51821 mtu=1380
```

### 8.2 — Get the MikroTik public key

```
/interface wireguard print detail
```

You will see output similar to this:

```
  name: wg-radius
  public-key: "LKMStk1/IpcOy/codwE9dqkAaqzajockSxmGu753w3Q="
  listen-port: 51821
```

> 🔴 **WRITE DOWN THE PUBLIC KEY NOW**
>
> Copy the full `public-key` value — it is **44 characters long and ends with =**  
> You will need this in Part B (server configuration).
>
> **MY ROUTER PUBLIC KEY:** `_______________________________________________`

### 8.3 — Add the central server as a VPN peer

The server public key below is **THE SAME for all routers — do not change it.**

```
/interface wireguard peers add \
  interface=wg-radius \
  comment="RADIUS Server" \
  public-key="1Yhn8SMYdclgGQIuC0Qn034K+IUyHehOEvlvZ/l4VnQ=" \
  endpoint-address=173.212.195.88 \
  endpoint-port=51820 \
  allowed-address=10.8.0.1/32 \
  persistent-keepalive=25s
```

### 8.4 — Assign your VPN IP address to this router

**CHANGE `10.8.0.11` to YOUR router's VPN IP from your prep sheet:**

```
/ip address add address=10.8.0.11/24 interface=wg-radius comment="WireGuard VPN"
```

> 🟠 **VPN IP REMINDER**
>
> - Branch 01 → `address=10.8.0.11/24`
> - Branch 02 → `address=10.8.0.12/24`
> - Branch 03 → `address=10.8.0.13/24`
>
> Each router **MUST** have its own unique IP. Never use the same IP twice!

---

# PART B — CENTRAL SERVER CONFIGURATION

_In this part you will SSH into the central server (173.212.195.88) and register this new router._

**You need:**

- A computer with internet access
- An SSH client: PuTTY on Windows, or the built-in Terminal on Mac/Linux
- The server root password (ask your system administrator)
- The MikroTik public key you wrote down in Step 8.2

---

## STEP 9 — Connect to Server & Configure WireGuard _(~5 min)_

### 9.1 — Open an SSH connection to the server

**On Windows (PuTTY):** Enter `173.212.195.88` as the hostname, port `22`, click Open.

**On Mac/Linux (Terminal):** Type this command and press Enter:

```
ssh root@173.212.195.88
```

When asked _"Are you sure you want to continue connecting?"_ — type `yes` and press Enter.

Enter the server root password when prompted.

You are now inside the server. You will see a prompt like: `root@server:~#`

### 9.2 — Open the WireGuard configuration file

```
nano /etc/wireguard/wg0.conf
```

This opens a text editor. Use the **DOWN ARROW key** to scroll all the way to the **bottom** of the file.

### 9.3 — Add your new router as a peer

At the very bottom of the file, add the following block. **CHANGE the values marked below:**

```
# Branch 01 - Harare CBD
[Peer]
PublicKey = LKMStk1/IpcOy/codwE9dqkAaqzajockSxmGu753w3Q=
AllowedIPs = 10.8.0.11/32
PersistentKeepalive = 25
```

> 🟠 **WHAT TO CHANGE IN THIS BLOCK**
>
> - `# Branch 01 - Harare CBD` → Change to your branch number and location name
> - `PublicKey = ...` → Replace with **YOUR MikroTik public key** (from Step 8.2)
> - `AllowedIPs = 10.8.0.11/32` → Replace `.11` with YOUR router's VPN IP last number
>
> Example for Branch 03: `AllowedIPs = 10.8.0.13/32`

### 9.4 — Save the file

Press **Ctrl + X**, then press **Y**, then press **Enter**.

### 9.5 — Restart WireGuard on the server

```
systemctl restart wg-quick@wg0
```

### 9.6 — Verify the router has connected

```
wg show
```

You should see an entry for your router's public key with a line that says **"latest handshake: X seconds ago"**. This confirms the VPN tunnel is UP.

If you do not see a handshake, wait 30 seconds and run `wg show` again.

---

## STEP 10 — Register Router in RADIUS Database _(~5 min)_

The RADIUS server must know about this router before it can authenticate vouchers from it.

### 10.1 — Open the MySQL database

```
mysql -u radius -p radius
```

It will ask for the MySQL radius user password. Enter it, then press Enter. You will see a prompt like: `mysql>`

### 10.2 — Add your router to the NAS table

Copy and paste the command below. **CHANGE the items marked:**

```sql
INSERT INTO nas (nasname, shortname, type, secret, description, location, branch) VALUES
('10.8.0.11', 'branch01-wg', 'other', 'Branch1Secret!', 'Branch 1 - Harare CBD (WireGuard)', 'Harare CBD', 'Branch1');
```

> 🟠 **WHAT TO CHANGE**
>
> - `10.8.0.11` → Your router's VPN IP (must match what you set in Step 8.4)
> - `branch01-wg` → Short name: `branch01-wg`, `branch02-wg`, `branch03-wg`, etc.
> - `Branch1Secret!` → Your RADIUS secret from prep sheet (e.g. `Branch2Secret!` for Branch 2)
> - `Branch 1 - Harare CBD` → Your branch description
> - `Harare CBD` → Your location name
> - `Branch1` → Your branch short identifier

### 10.3 — Verify the entry was added

```sql
SELECT nasname, shortname, secret FROM nas WHERE nasname='10.8.0.11';
```

You should see your router's IP, short name, and secret in the results.

### 10.4 — Exit MySQL

```
EXIT;
```

### 10.5 — Restart FreeRADIUS

```
systemctl restart freeradius
```

### 10.6 — Check FreeRADIUS is running

```
systemctl status freeradius
```

Look for `Active: active (running)` in the output.

### 10.7 — Create a test voucher

While still on the server, create a test token you will use in Step 13:

```
mysql -u radius -p radius
```

Enter the password, then paste:

```sql
INSERT INTO radcheck (username, attribute, op, value) VALUES ('TEST001', 'Cleartext-Password', ':=', 'test123');
INSERT INTO radreply (username, attribute, op, value) VALUES ('TEST001', 'Session-Timeout', ':=', '86400');
EXIT;
```

> ℹ️ You can also generate real vouchers later via the web interface:  
> **http://173.212.195.88/staff-token-generator-packages.php**

### 10.8 — Exit the server SSH session

```
exit
```

You are now back on your local computer.

---

# PART C — COMPLETE & TEST ON MIKROTIK

_Go back to the MikroTik terminal (WinBox or WebFig)._

---

## STEP 11 — Configure RADIUS & Security _(~5 min)_

### 11.1 — Test VPN connectivity first

```
/ping 10.8.0.1 count=5
```

You should get 5 replies. If ping fails — go back and re-check Step 9 (server WireGuard config).

### 11.2 — Add RADIUS server on MikroTik

**CHANGE `Branch1Secret!` to YOUR RADIUS secret** (must exactly match what you entered in Step 10.2):

```
/radius add \
  address=10.8.0.1 \
  secret=Branch1Secret! \
  service=hotspot,login \
  timeout=3s \
  comment="RADIUS via WireGuard"
```

> 🔴 **SECRET MUST MATCH EXACTLY**  
> The secret here must be **IDENTICAL** (letter-for-letter, capital-for-capital) to what you inserted into the MySQL database in Step 10.2. If they do not match, no vouchers will work.

### 11.3 — Secure management access (WinBox NEVER locked out)

> ✅ **WHY THIS IS SAFE AND WILL NEVER LOCK YOU OUT**
>
> There are two layers of security on this router:
>
> **Layer 1 — Firewall input drop rule** (added in Step 6.4): blocks ALL uninvited traffic arriving
> on ether1 (the Starlink/internet port). This means no one from the internet can reach WinBox,
> SSH, or the web interface — the firewall drops the packets before they even reach the services.
>
> **Layer 2 — Service restrictions below**: we disable dangerous services (telnet, FTP, API)
> and restrict web/SSH to the local network. WinBox is left **unrestricted by IP** (`0.0.0.0/0`)
> because the firewall already blocks it from the internet, and restricting it by IP is what
> caused the lockout problem — RouterOS 7.x checks the IP restriction BEFORE a DHCP lease
> is issued, so even the Neighbors tab login fails if the laptop has no IP yet.
>
> **Result: WinBox works from any LAN port at any time. Internet cannot reach it.**

```
/ip service set telnet disabled=yes
/ip service set ftp disabled=yes
/ip service set www address=10.10.10.0/24,10.8.0.0/24
/ip service set ssh address=10.10.10.0/24,10.8.0.0/24
/ip service set winbox address=0.0.0.0/0
/ip service set api disabled=yes
/ip service set api-ssl disabled=yes
```

> ℹ️ **After running these commands, you can access the router by:**
>
> - **WinBox Neighbors tab** — plug Ethernet into ether2/3/4/5, open WinBox → Neighbors → click router → login. ✅ Works immediately, even before laptop gets a DHCP address.
> - **WinBox by IP** — connect Ethernet to ether2–5, wait for `10.10.10.x` from DHCP, WinBox to `10.10.10.1`
> - **Browser** — connect to ZimSmartVillages WiFi or ether2–5, go to `http://10.10.10.1`
> - **Via VPN** — connect WinBox or browser to `10.8.0.XX` (your branch VPN IP)

### 11.4 — Set timezone and time server

```
/system clock set time-zone-name=Africa/Harare
/system ntp client set enabled=yes servers=pool.ntp.org
```

### 11.5 — Disable WAN discovery but keep LAN MAC access

> This stops the router being visible on the internet side while keeping WinBox discovery
> working on the LAN (ether2–5 and WiFi). We create a named interface list so the
> MAC-server only responds on the hotspot bridge — not on ether1.

```
# Disable neighbor discovery on all interfaces (stops router broadcasting itself)
/ip neighbor discovery-settings set discover-interface-list=none

# Disable MAC-server on all interfaces first
/tool mac-server set allowed-interface-list=none
/tool mac-server mac-winbox set allowed-interface-list=none

# Re-enable MAC-server on the LAN only (WinBox Neighbors tab keeps working)
/interface list add name=LAN-only comment="Local management only"
/interface list member add interface=bridge-hotspot list=LAN-only
/tool mac-server set allowed-interface-list=LAN-only
/tool mac-server mac-winbox set allowed-interface-list=LAN-only
```

> ✅ **Result:**
>
> - WinBox Neighbors tab works from any LAN cable or WiFi — always, with no IP needed first
> - Internet/WAN side cannot discover or reach WinBox
> - Strong admin password + firewall drop rule = fully secure

---

## STEP 12 — Final Backup & Reboot _(~5 min)_

### 12.1 — Clear old connection tracking

```
/ip firewall connection remove [find]
```

### 12.2 — Create a backup

**CHANGE `branch01` to your branch number:**

```
/system backup save name=branch01-initial-config
/export file=branch01-config
```

Download the backup via WinBox: **Files → right-click the backup file → Download.**

### 12.3 — Reboot the router

```
/system reboot
```

Type `y` and press Enter. **Wait 2–3 minutes** for the router to restart.

### 12.4 — Reconnect after reboot

> ✅ **WinBox WILL find your router after reboot. No lockout. Guaranteed.**
>
> Because `winbox address=0.0.0.0/0` is set and the MAC-server is active on the LAN,
> WinBox can always discover and connect — even before your laptop gets a DHCP address.
>
> **To reconnect after reboot:**
>
> **Method 1 — WinBox Neighbors tab (fastest, always works):**
>
> - Plug Ethernet cable into **ether2, 3, 4 or 5** (NOT ether1)
> - Open WinBox → click "…" → Neighbors tab → your router appears
> - Click it → username: `admin` → your password → Connect ✅
>
> **Method 2 — WinBox by IP (after DHCP):**
>
> - Plug Ethernet into ether2–5 → laptop gets `10.10.10.x` from DHCP
> - WinBox Connect To: `10.10.10.1` → username: `admin` → password ✅
>
> **Method 3 — Browser:**
>
> - Connect to **ZimSmartVillages** WiFi or ether2–5
> - Open: `http://10.10.10.1` ✅
>
> **Method 4 — Via VPN:**
>
> - Connect to `10.8.0.XX` (your branch VPN IP) ✅

### 12.5 — Verify all services after reboot

After reconnecting, run:

```
# Check internet
/ping 8.8.8.8 count=3

# Check VPN tunnel
/ping 10.8.0.1 count=3

# Check hotspot is running
/ip hotspot print

# Check RADIUS connection (wait 10 seconds, then press Ctrl+C)
/radius monitor 0
```

You should see `status: connected` from the RADIUS monitor.

---

## STEP 13 — Test the Hotspot from a Phone _(~5 min)_

> ✅ **THIS IS THE MOST IMPORTANT TEST**  
> Do this test from a real **mobile phone** — not from your laptop that is wired to the router.

### 13.1 — Test basic login

1. On your phone, go to WiFi settings and connect to: **ZimSmartVillages**
2. Open any web browser on the phone.
3. Go to **http://google.com** — use `http://`, NOT `https://`
4. The ZimSmartVillages login page should appear automatically.
5. Enter **Username:** `TEST001` and **Password:** `test123`
6. Tap Login / Connect.
7. You should see a success page and the website should load. ✓ Internet is working!

### 13.2 — Test persistent session (reconnection without login)

1. After you have logged in and browsed for 1–2 minutes…
2. **Turn WiFi OFF** on your phone.
3. Wait 30 seconds.
4. **Turn WiFi back ON** and connect to ZimSmartVillages again.
5. Open a browser and go to any website.

**The website should load WITHOUT showing the login page again.** This means persistent sessions are working! ✓

### 13.3 — Verify on the router

```
/ip hotspot active print
/ip hotspot cookie print
```

Active print shows currently connected users. Cookie print shows remembered devices.

---

> ✅ **DEPLOYMENT COMPLETE!**
>
> If all tests above passed, this router is production-ready:
>
> - WiFi: ZimSmartVillages is broadcasting ✓
> - VPN tunnel to server is active ✓
> - RADIUS authentication is working ✓
> - Persistent sessions are enabled ✓
> - Backup has been saved ✓

---

# Quick Reference — Daily Operations

## Access the Router After Deployment

After management restriction, you can reach the router by any of these methods:

- **WinBox Neighbors tab (MAC address)** — plug cable into ether2/3/4/5, open WinBox → Neighbors tab → click router ✓ Always works even without a DHCP lease
- **WinBox by IP** — plug cable into ether2–5 (wait for `10.10.10.x` from DHCP), WinBox Connect To: `10.10.10.1`
- **Browser** — connect to ZimSmartVillages WiFi or ether2–5, open `http://10.10.10.1`
- **Via VPN** — connect to `10.8.0.XX` (your branch VPN IP)

## Common Daily Commands

```
# See all currently connected users
/ip hotspot active print

# Disconnect a specific user
/ip hotspot active remove [find user=USERNAME]

# Disconnect ALL users (clears all sessions)
/ip hotspot active remove [find]
/ip hotspot cookie remove [find]

# Check VPN tunnel is alive
/ping 10.8.0.1

# Check internet is alive
/ping 8.8.8.8

# Check system health
/system resource print

# View hotspot logs
/log print where topics~"hotspot"

# Restart the hotspot (if login page not appearing)
/ip hotspot disable hotspot1
/ip hotspot enable hotspot1

# Restart WiFi (if no one can connect)
/interface wireless disable wlan1
/interface wireless enable wlan1

# Create a new backup
/system backup save name=branch01-backup

# Reboot router
/system reboot
```

## Generate Vouchers

```
URL:      http://173.212.195.88/staff-token-generator-packages.php
Packages: 1-Hour, 3-Hour, 1-Day, 1-Week
Steps:    Login → Select package → Generate batch → Print / export
```

## Monitor Sessions (on Server)

```
ssh root@173.212.195.88

mysql -u radius -p radius -e "SELECT username, nasipaddress, acctstarttime FROM radacct WHERE acctstoptime IS NULL;"

# Or use web dashboard:
http://173.212.195.88/acct-all.php
```

---

# Troubleshooting Guide

## Problem 1: WinBox cannot find or connect to the router

If you followed this guide correctly (v3 final), WinBox **should always work** because:

- `winbox address=0.0.0.0/0` — no IP restriction on WinBox service
- MAC-server active on `bridge-hotspot` — WinBox Neighbors tab always discovers the router

If you are still having trouble, work through these in order:

**Check 1 — Are you plugged into the right port?**

- Cable must be in ether2, 3, 4 or 5. **NOT ether1** (that is Starlink only)
- Unplug and replug the cable, wait 10 seconds

**Check 2 — WinBox Neighbors tab**

- Open WinBox → click "…" → Neighbors tab → wait 10 seconds
- Your router should appear. Click it. Login with `admin` and your password.

**Check 3 — Try WinBox by IP**

- Check your laptop has an IP starting with `10.10.10.x` (check network settings)
- WinBox Connect To: `10.10.10.1`

**Check 4 — Try the browser**

- Open Chrome/Firefox → go to `http://10.10.10.1`

**Check 5 — Did you follow an older guide that restricted winbox by IP?**
If yes, your winbox service has `address=10.10.10.0/24` which blocks login before DHCP.
Fix: get access via browser `http://10.10.10.1` then run:

```
/ip service set winbox address=0.0.0.0/0
```

**Last resort — soft reset (keeps all config):**

- Hold reset button for **3–4 seconds only** then release
- Wait 2 minutes → WinBox Neighbors tab → connect → run the winbox fix above

---

## Problem 2: Login works but no internet after authentication

This is a **firewall rule ordering problem**. The drop-all rule is blocking traffic before the allow rules can match.

**Fix — wipe and rebuild firewall in correct order:**

```
/ip firewall filter remove [find]
/ip firewall nat remove [find]
/ip firewall mangle remove [find]

/ip firewall nat add \
  chain=srcnat out-interface=ether1 action=masquerade \
  comment="Masquerade to WAN"

/ip firewall filter add \
  chain=input connection-state=established,related action=accept \
  comment="Allow established input"

/ip firewall filter add \
  chain=input protocol=icmp action=accept \
  comment="Allow ICMP"

/ip firewall filter add \
  chain=input in-interface=bridge-hotspot action=accept \
  comment="Allow from LAN"

/ip firewall filter add \
  chain=forward connection-state=established,related \
  action=fasttrack-connection comment="FastTrack for speed"

/ip firewall filter add \
  chain=forward connection-state=established,related action=accept \
  comment="Allow established forward"

/ip firewall filter add \
  chain=forward in-interface=bridge-hotspot out-interface=ether1 \
  action=accept comment="Hotspot to Internet"

/ip firewall filter add \
  chain=forward connection-state=invalid action=drop \
  comment="Drop invalid"

/ip firewall filter add \
  chain=input action=drop \
  comment="Drop all other input"

/ip firewall mangle add \
  chain=forward protocol=tcp tcp-flags=syn \
  action=change-mss new-mss=1340 comment="Optimize VPN MTU"
```

Then reset stale sessions and retry:

```
/ip hotspot active remove [find]
/ip hotspot cookie remove [find]
```

And on the server, clear the test voucher's used session:

```sql
mysql -u radius -p radius
DELETE FROM radacct WHERE username='TEST001';
EXIT;
```

---

## Problem 3: VPN ping fails (`/ping 10.8.0.1` times out)

The VPN tunnel has not established. RADIUS will NOT work until this is fixed.

**Check 1 — Public key on server matches exactly:**

```
# On the server:
grep -A 3 "10.8.0.XX" /etc/wireguard/wg0.conf
# Compare to MikroTik:
/interface wireguard print detail
```

**Check 2 — Restart WireGuard on server:**

```
systemctl restart wg-quick@wg0
wg show
```

**Check 3 — Verify VPN IP on MikroTik:**

```
/ip address print where interface=wg-radius
```

**Check 4:** WireGuard takes up to 30 seconds to establish. Wait and try ping again.

---

## Problem 4: Login page does not appear

**Check 1:** Always navigate to `http://google.com` (not `https://`) to trigger the redirect.

**Check 2 — Restart the hotspot:**

```
/ip hotspot disable hotspot1
/ip hotspot enable hotspot1
```

**Check 3:** Open an incognito/private browser window and try again.

**Check 4:**

```
/ip hotspot print
```

There must be NO X flag next to `hotspot1`.

---

## Problem 5: Login page appears but voucher is rejected

**Check 1 — RADIUS secret matches:**

```
# On MikroTik:
/radius print detail

# On server:
mysql -u radius -p radius -e "SELECT nasname, secret FROM nas WHERE nasname='10.8.0.11';"
```

The secret must be **IDENTICAL** on both sides.

**Check 2:**

```
systemctl status freeradius
```

**Check 3:**

```
mysql -u radius -p radius -e "SELECT * FROM radcheck WHERE username='TEST001';"
```

---

## Problem 6: Captive portal login page shows 404 error

**Cause:** The hotspot profile has `html-directory=hotspot` but on RouterOS 7.x clean or Netinstall builds that folder is empty. RouterOS has no HTML to serve → 404.

**Fix:**

```
/ip hotspot profile set custom-hotspot html-directory=""
/ip hotspot disable hotspot1
/ip hotspot enable hotspot1
```

Setting `html-directory` to empty forces RouterOS to use its built-in internal login pages which always exist. Test from phone: connect to ZimSmartVillages → open `http://google.com` → login page appears correctly.

---

## Problem 7: Login page appears but persistent sessions not working (login required every reconnect)

**Check 1 — Is `cookie` in login-by?**

```
/ip hotspot profile print
```

Must show `login-by=http-pap,cookie` — the `cookie` part is what remembers the device. If it only shows `login-by=http-pap`, fix it:

```
/ip hotspot profile set custom-hotspot login-by=http-pap,cookie
/ip hotspot disable hotspot1
/ip hotspot enable hotspot1
```

**Check 2 — User profile settings:**

```
/ip hotspot user profile print detail
```

Must show: `shared-users=unlimited`, `keepalive-timeout=none`, `idle-timeout=none`, `add-mac-cookie=yes`

**Fix if wrong:**

```
/ip hotspot user profile set default-hotspot \
  shared-users=unlimited \
  keepalive-timeout=none \
  idle-timeout=none \
  add-mac-cookie=yes
```

---

## Problem 8: Got disconnected during Step 5 and cannot reconnect

**Most likely cause:** DHCP server was not set up on `bridge-hotspot` before ports were moved,
so your laptop had nowhere to get an IP from. The router is fine — you just have no route to it.

**Recovery option 1 — Set a static IP on your laptop:**

- Windows: Network adapter → IPv4 Properties → Use the following IP address
- IP: `10.10.10.50` / Subnet: `255.255.255.0` / Gateway: `10.10.10.1`
- Open WinBox → Connect To: `10.10.10.1` → login
- Once in, run the DHCP block from Step 5.2, then switch your adapter back to DHCP

**Recovery option 2 — WinBox Neighbors tab (works without any IP):**

- Plug cable into a different ether port (try ether3 or ether4)
- WinBox → `...` → Neighbors tab → wait 15 seconds → router appears → click → login

**Recovery option 3 — Factory reset and start again with correct method:**

- Hold reset button for 10 seconds until LED flashes
- Wait 2 minutes, reconnect via Neighbors tab or `192.168.88.1`
- This time use `/system reset-configuration skip-backup=yes` (NOT no-defaults=yes)
- Then follow Step 5 exactly — **set up DHCP in Step 5.2 before moving any ports**

## Problem 9: Internet is very slow

**Check FastTrack:**

```
/ip firewall filter print where action=fasttrack-connection
```

**Check MTU:**

```
/interface wireguard print detail
```

Should show `mtu=1380`.

**Check no rate limit:**

```
/ip hotspot user profile print detail where name=default-hotspot
```

Should show `rate-limit=` (empty = unlimited).

---

# Deployment Checklist

Use this checklist for **EVERY router**. Tick each box as you complete it.

**Before Starting**

- [ ] Prep sheet filled in (branch #, VPN IP, RADIUS secret, admin password)
- [ ] Starlink dish connected to ether1

**Part A — MikroTik**

- [ ] Connected to router via WinBox or browser
- [ ] Factory reset completed (if router was previously used)
- [ ] Admin password set (strong, written down)
- [ ] Router identity set (Branch01-Location)
- [ ] WiFi configured — wlan1, SSID: ZimSmartVillages, country: zimbabwe
- [ ] Factory reset done with `/system reset-configuration skip-backup=yes` (NOT no-defaults=yes)
- [ ] Reconnected after reset via 192.168.88.1 or WinBox Neighbors tab
- [ ] Admin password set (strong, written down)
- [ ] Router identity set (Branch01-Location)
- [ ] WiFi configured — wlan1, SSID: ZimSmartVillages, country: zimbabwe
- [ ] Step 5.1: Ran bridge check — determined PATH A (blank output) or PATH B (existing bridge)
- [ ] Step 5.2: bridge-hotspot created + IP + DHCP all set up BEFORE any ports moved
- [ ] Step 5.3/5.4: All ports added/moved to bridge-hotspot (wlan1 + ether2–5)
- [ ] Step 5.5 (Path B): Laptop port moved last — brief disconnect — reconnected via Neighbors/10.10.10.1
- [ ] Step 5.6 (Path B): Old bridge removed, old IPs and DHCP entries cleaned up
- [ ] Step 5.7: bridge-hotspot confirmed running, correct ports, 10.10.10.1/24 valid, DHCP running
- [ ] Internet working — `/ping 8.8.8.8` replies
- [ ] Existing firewall rules cleared before adding new ones
- [ ] NAT masquerade added (first rule)
- [ ] Firewall allow rules added BEFORE drop rules
- [ ] Drop rules confirmed LAST in filter list
- [ ] MTU mangle rule added (new-mss=1340)
- [ ] Hotspot profile created: login-by=http-pap,cookie AND html-directory="" (empty string)
- [ ] User profile created (no timeouts, add-mac-cookie=yes)
- [ ] Hotspot server created and enabled
- [ ] WireGuard interface created (listen-port=51821, mtu=1380)
- [ ] MikroTik PUBLIC KEY written down
- [ ] Server peer added (public key + endpoint)
- [ ] VPN IP assigned to wg-radius interface

**Part B — Server**

- [ ] SSH'd into server 173.212.195.88
- [ ] New [Peer] block added to /etc/wireguard/wg0.conf
- [ ] WireGuard restarted on server (`wg show` shows handshake)
- [ ] Router added to MySQL NAS table
- [ ] FreeRADIUS restarted and running
- [ ] TEST001 test voucher created in database

**Part C — Finish & Test**

- [ ] Back on MikroTik — VPN ping 10.8.0.1 works
- [ ] RADIUS secret configured on MikroTik
- [ ] Management access secured: telnet/ftp/api disabled, winbox=0.0.0.0/0 (no IP restriction)
- [ ] Timezone set (Africa/Harare) and NTP enabled
- [ ] Connection tracking cleared
- [ ] Backup created and downloaded
- [ ] Router rebooted
- [ ] After reboot — reconnected via ether2–5 to 10.10.10.1
- [ ] After reboot — all pings work (8.8.8.8 and 10.8.0.1)
- [ ] TEST001 voucher tested from a real phone — login AND internet work
- [ ] Persistent session tested — reconnect without login prompt
- [ ] Real vouchers generated for distribution
- [ ] Configuration record completed and filed

---

# Branch Configuration Record

_Fill this in completely after each deployment. Keep a copy in your records._

| Field                      | Value                                        |
| -------------------------- | -------------------------------------------- |
| **Branch Number**          |                                              |
| **Location Name**          |                                              |
| **Physical Address**       |                                              |
| **Contact Person on Site** |                                              |
| **Contact Phone**          |                                              |
| **Installation Date**      |                                              |
| **Installed By**           |                                              |
| **Router Model**           | MikroTik RB951                               |
| **Serial Number**          |                                              |
| **RouterOS Version**       | 7.22.2                                       |
| **Wireless Package**       | wireless                                     |
| **WAN Interface**          | ether1 (Starlink DHCP)                       |
| **LAN Network**            | 10.10.10.0/24                                |
| **Hotspot Gateway**        | 10.10.10.1                                   |
| **DHCP Pool**              | 10.10.10.10–10.10.10.254                     |
| **WiFi SSID**              | ZimSmartVillages                             |
| **WiFi Interface**         | wlan1                                        |
| **VPN Interface**          | wg-radius                                    |
| **This Router's VPN IP**   | 10.8.0.\_\_ /24                              |
| **MikroTik Public Key**    |                                              |
| **Server Public Key**      | 1Yhn8SMYdclgGQIuC0Qn034K+IUyHehOEvlvZ/l4VnQ= |
| **RADIUS Secret**          |                                              |
| **Admin Password**         |                                              |
| **WebFig URL**             | http://10.10.10.1                            |
| **WinBox Address**         | 10.10.10.1 or 10.8.0.XX                      |
| **Backup File Name**       | branch01-initial-config.backup               |

**Notes:**

---

# Appendix: Reference Tables

> 🔴 **KEEP THIS SECURE — STORE ENCRYPTED**

## VPN IP & RADIUS Secret Assignment

| Branch | VPN IP    | Router Identity Example | RADIUS Secret   |
| ------ | --------- | ----------------------- | --------------- |
| 01     | 10.8.0.11 | Branch01-Harare-CBD     | Branch1Secret!  |
| 02     | 10.8.0.12 | Branch02-Bulawayo       | Branch2Secret!  |
| 03     | 10.8.0.13 | Branch03-Mutare         | Branch3Secret!  |
| 04     | 10.8.0.14 | Branch04-Gweru          | Branch4Secret!  |
| 05     | 10.8.0.15 | Branch05-Kwekwe         | Branch5Secret!  |
| 06     | 10.8.0.16 | Branch06-Kadoma         | Branch6Secret!  |
| 07     | 10.8.0.17 | Branch07-Masvingo       | Branch7Secret!  |
| 08     | 10.8.0.18 | Branch08-Chinhoyi       | Branch8Secret!  |
| 09     | 10.8.0.19 | Branch09-Kariba         | Branch9Secret!  |
| 10     | 10.8.0.20 | Branch10-Victoria-Falls | Branch10Secret! |
| 15     | 10.8.0.25 | Branch15-Location       | Branch15Secret! |
| 20     | 10.8.0.30 | Branch20-Location       | Branch20Secret! |
| 25     | 10.8.0.35 | Branch25-Location       | Branch25Secret! |
| 30     | 10.8.0.40 | Branch30-Location       | Branch30Secret! |
| 50     | 10.8.0.60 | Branch50-Location       | Branch50Secret! |

## Server Resources

| Resource             | URL / Command                                            |
| -------------------- | -------------------------------------------------------- |
| daloRADIUS Dashboard | http://173.212.195.88                                    |
| Token Generator      | http://173.212.195.88/staff-token-generator-packages.php |
| Accounting Records   | http://173.212.195.88/acct-all.php                       |
| SSH to Server        | `ssh root@173.212.195.88`                                |
| WireGuard Config     | `/etc/wireguard/wg0.conf`                                |
| FreeRADIUS Logs      | `/var/log/freeradius/radius.log`                         |
| MySQL Command        | `mysql -u radius -p radius`                              |

## Time Estimates Per Router

| Phase                          | Time          | Notes                        |
| ------------------------------ | ------------- | ---------------------------- |
| Factory reset                  | 3 min         | Only if previously used      |
| Initial setup (Steps 1–3)      | 5 min         | Connect, reset, password     |
| WiFi config (Step 4)           | 3 min         | Copy-paste commands          |
| Bridge, IP, DHCP (Step 5)      | 5 min         | Includes clearing old bridge |
| Internet & NAT (Step 6)        | 7 min         | Includes internet test       |
| Hotspot setup (Step 7)         | 5 min         | Copy-paste commands          |
| WireGuard setup (Step 8)       | 5 min         | Get public key, add peer     |
| Server config (Steps 9–10)     | 7 min         | SSH, WG config, MySQL        |
| RADIUS & security (Step 11)    | 5 min         | Back on MikroTik             |
| Reboot & testing (Steps 12–13) | 7 min         | Verify everything works      |
| **TOTAL**                      | **35–40 min** | **Per router**               |

---

_ZimSmartVillages WiFi Deployment Manual · Version 2.0 · 2026_  
_MikroTik RB951 · RouterOS 7.22.2 · WireGuard VPN · FreeRADIUS · daloRADIUS_

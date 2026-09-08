# Deploying Karpul to Hetzner (alongside gamgee, iris and flora-find)

This deploys Karpul on the **same** Hetzner VPS that already runs gamgee, iris
and flora-find, using the same pattern (host-level Caddy for TLS, a
loopback-only compose stack), so all four apps coexist without interfering.
The existing apps stay completely untouched.

This guide assumes that server already exists and is working (Docker and Caddy
are installed from the earlier deploys).

---

## How the apps share one server

```
                              Browser
                                 |  HTTPS (443)
                                 v
                          Caddy (on the host, one instance)
        /                  |                    |                   \
  gamgee.com      iris-application.com    flora-find.com     karpul.example.com
      |                    |                    |                    |
 localhost:3000      localhost:3001       localhost:3002       localhost:3003
      |                    |                    |                    |
  /opt/gamgee          /opt/iris          /opt/flora-find        /opt/karpul
```

One Caddy instance on the host serves every domain. Each app is a separate
Docker Compose project in its own directory, publishing to a different loopback
port. You only **add** a Karpul block to Caddy and start a fourth stack.

| Concern | gamgee | iris | flora-find | Karpul |
| --- | --- | --- | --- | --- |
| Loopback port | `127.0.0.1:3000` | `127.0.0.1:3001` | `127.0.0.1:3002` | `127.0.0.1:3003` |
| Deploy dir / compose project | `/opt/gamgee` | `/opt/iris` | `/opt/flora-find` | `/opt/karpul` |
| Caddy block | `gamgee.com {}` | `iris-application.com {}` | `flora-find.com {}` | `karpul.example.com {}` |

Karpul's container is named `karpul-app-1` and its volume `karpul_karpul_data`.
Neither collides with the other apps.

**How Karpul is shaped internally:** one application container. The FastAPI
backend serves the API under `/api` and the built React frontend from the same
origin on port 8000 (see the repo `Dockerfile`). SQLite lives in the named
volume. No database container, no nginx.

---

## 1. Point DNS at the server

Create an `A` record for the Karpul domain pointing at the **same** server IP
the other apps use (and `AAAA` if the box has IPv6 records for the others).
Wait for it to resolve before step 4: Caddy needs the name to resolve to the
server to obtain a certificate.

> No new firewall rules are needed: ports 80 and 443 are already open, and
> Karpul publishes nothing else to the host.

---

## 2. Clone Karpul into its own directory

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/LosBobes/karpul.git /opt/karpul
cd /opt/karpul
```

Docker and Caddy are already installed, so there is nothing else to install.

---

## 3. Configure the environment

```bash
cd /opt/karpul
cp .env.prod.example .env
nano .env
```

Karpul has no secrets of its own (no accounts, no tokens). Set the public
origin and, optionally, the company-car pool that is seeded on first start:

```env
CORS_ORIGINS=https://karpul.example.com
CORPORATE_CARS=Skoda Octavia|BG-123-XY|4;VW Transporter|BG-456-ZZ|8
```

The `.env` file is gitignored and stays only on the server. The seed applies
only while the car table is empty; edit the `corporatecar` table (or reset the
volume) to change the pool later.

---

## 4. Add the Karpul block to Caddy (do not overwrite the others)

The server has a single `/etc/caddy/Caddyfile` that already contains the other
apps' blocks. **Append** Karpul's block; do not replace the file. Fix the
domain in the repo `Caddyfile` first if it still says `karpul.example.com`.

```bash
cat /opt/karpul/Caddyfile >> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

The reload is zero-downtime and does not affect the other apps.

---

## 5. Build and start the Karpul stack

```bash
cd /opt/karpul
docker compose -f docker-compose.prod.yml up --build -d
```

Only `127.0.0.1:3003` is published, so the stack is reachable only through
Caddy. Caddy provisions the TLS certificate on the first request.

Verify:

```bash
docker compose -f docker-compose.prod.yml ps          # app "Up (healthy)"
curl -sS https://karpul.example.com/api/health         # {"status":"ok"}
curl -sS https://karpul.example.com/api/cars/corporate # seeded car pool
```

---

## 6. Automatic deploys via GitHub Actions

`.github/workflows/deploy.yml` redeploys Karpul on every push to `main` by
SSHing in, pulling and rebuilding, exactly like the sibling repos.

| Secret | Where | Value |
| --- | --- | --- |
| `HETZNER_HOST` | LosBobes org secret (already exists) | Server IP or hostname |
| `HETZNER_USER` | org secret (already exists) | SSH user |
| `HETZNER_SSH_KEY` | org secret (already exists) | Private key whose public half is on the server |
| `HETZNER_PORT` | org secret, optional | SSH port, defaults to 22 |

The deploy directory is **hard-coded** to `/opt/karpul` in the workflow and is
never read from a secret. The org also carries a `DEPLOY_PATH` secret that
belongs to another app; reading it here would (and once did) run Karpul's deploy
inside that app's checkout. The remote script additionally checks that the
directory's git remote is `LosBobes/karpul` and that its compose file is
Karpul's before it builds or restarts anything, so a wrong path fails fast
instead of touching a neighbour.

Until the one-time bootstrap above is done, the deploy job fails at that guard
with a message pointing back here.

---

## Updating after code changes

On the server:

```bash
cd /opt/karpul && git pull && docker compose -f docker-compose.prod.yml up --build -d
```

Or from your laptop with the `Makefile` (set `HETZNER_HOST` / `HETZNER_USER`
in your shell profile first):

```bash
make deploy     # git pull + rebuild on the server
make logs       # tail container logs
make ssh        # shell into the server
make backup     # copy the live SQLite file to ./karpul-<date>.db
```

The database is untouched by rebuilds: it lives in the `karpul_karpul_data`
named volume. Only `docker compose -f docker-compose.prod.yml down -v` would
delete it. Tables are created on boot if missing.

---

## Logs and debugging

```bash
docker compose -f docker-compose.prod.yml logs -f      # Karpul
journalctl -u caddy -f                                  # Caddy (shared)
```

## Rollback

Karpul builds from source on the server, so roll back by checking out a
known-good commit and rebuilding:

```bash
cd /opt/karpul
git checkout <known-good-sha>
docker compose -f docker-compose.prod.yml up --build -d
```

Return to automatic updates by checking out `main` again and pushing.

## Removing Karpul

Delete only its block from `/etc/caddy/Caddyfile`, `systemctl reload caddy`,
then `docker compose -f docker-compose.prod.yml down` in `/opt/karpul`. The
other apps are independent and keep running throughout.

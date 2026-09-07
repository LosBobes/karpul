# Deploying Karpul to a Hetzner VPS

One small server, Docker Compose, Caddy for automatic HTTPS, GitHub Actions for deploys.
Nothing secret lives in the repo: the Hetzner token, SSH key and domain are all GitHub
secrets or local environment variables.

## 1. Create the server (Terraform, once)

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars      # fill in ssh_public_key (and location/type)
export TF_VAR_hcloud_token=<Hetzner Cloud API token, Read & Write>
terraform init
terraform apply
```

This creates a `cx22` Ubuntu 24.04 server with a cloud firewall (22/80/443) and runs
`cloud-init.yaml` on first boot: installs Docker, creates a `deploy` user with your SSH key,
enables ufw and fail2ban, disables password SSH. Note the `ipv4` output.

Prefer clicking? Create a server in the Hetzner console with Ubuntu 24.04, paste
`cloud-init.yaml` into *Cloud config*, add your SSH key, and open ports 22/80/443 in a firewall.

## 2. DNS

Add an `A` record (and `AAAA` if you like) for your domain pointing at the server IP.
Caddy needs the name to resolve before it can obtain a certificate.

## 3. GitHub secrets

Repository → Settings → Secrets and variables → Actions (or an `production` environment):

| Secret | Value |
| --- | --- |
| `HETZNER_HOST` | Server IPv4 from step 1 |
| `HETZNER_SSH_USER` | `deploy` |
| `HETZNER_SSH_KEY` | Private key matching `ssh_public_key` (ed25519, PEM text, no passphrase) |
| `DOMAIN` | e.g. `karpul.example.com` |
| `CORPORATE_CARS` | *(optional)* `Skoda Octavia\|B-123-XY\|4;VW Transporter\|B-456-ZZ\|8` |

Generate a dedicated deploy key with `ssh-keygen -t ed25519 -C deploy@karpul -f karpul_deploy`
and use `karpul_deploy.pub` in Terraform and `karpul_deploy` as the secret.

## 4. Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: rsync the repo to `/opt/karpul`,
`docker compose up -d --build`, then curl `/api/health` over HTTPS. You can also trigger it
from the *Actions* tab (`workflow_dispatch`).

Manual deploy from the server:

```bash
ssh deploy@<ip>
cd /opt/karpul
cp deploy/.env.example deploy/.env && $EDITOR deploy/.env   # first time only
bash deploy/deploy.sh
```

## Operations

```bash
cd /opt/karpul
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs -f
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps
# SQLite backup
docker run --rm -v karpul_karpul-data:/data -v "$PWD":/out alpine cp /data/karpul.db /out/karpul-$(date +%F).db
```

The database lives in the `karpul-data` volume; certificates in `caddy-data`. Both survive
rebuilds and `docker compose down` (they are only removed with `down -v`).

# Shorthand for the Hetzner deploy. Mirrors gamgee's, iris's and flora-find's Makefiles.
#
# Set HETZNER_HOST / HETZNER_USER in your shell profile (same names as the
# GitHub Actions secrets) or pass them on the command line:
#   export HETZNER_HOST=1.2.3.4   HETZNER_USER=root
#   make ssh HETZNER_HOST=1.2.3.4 HETZNER_USER=root
HETZNER_USER ?= root
HOST         ?= $(HETZNER_USER)@$(HETZNER_HOST)
DEPLOY_PATH  ?= /opt/karpul

.PHONY: ssh logs deploy backup

# SSH into the server.
ssh:
	ssh $(HOST)

# Tail the running container logs.
logs:
	ssh $(HOST) "cd $(DEPLOY_PATH) && docker compose -f docker-compose.prod.yml logs -f"

# Manual deploy (the GitHub Action does this automatically on push to main).
deploy:
	ssh $(HOST) "cd $(DEPLOY_PATH) && git fetch origin main && git reset --hard origin/main && docker compose -f docker-compose.prod.yml up --build -d --remove-orphans && docker image prune -f"

# Snapshot the live SQLite database to ./karpul-<date>.db. Goes through
# SQLite's backup API (backend/app/backup.py), not `cat`: the database runs in
# WAL mode, so the file on its own is missing whatever is still in karpul.db-wal.
backup:
	ssh $(HOST) "docker compose -f $(DEPLOY_PATH)/docker-compose.prod.yml exec -T app python -m app.backup" > karpul-$$(date +%Y%m%d).db

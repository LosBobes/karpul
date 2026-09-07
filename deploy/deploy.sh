#!/usr/bin/env bash
# Runs on the server (invoked by the GitHub Actions workflow, or by hand):
#   bash deploy/deploy.sh
# Expects the repo checked out / rsynced to the current directory and deploy/.env present.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f deploy/.env ]]; then
  echo "deploy/.env is missing - copy deploy/.env.example and set DOMAIN" >&2
  exit 1
fi

docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps

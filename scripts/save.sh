#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

message="${1:-Verify and save game changes}"
secret="${CONTAINER_SECRET:?CONTAINER_SECRET is required}"
generation="${PROVISIONING_GENERATION:?PROVISIONING_GENERATION is required}"
token="${PROVISIONING_TOKEN:?PROVISIONING_TOKEN is required}"

node tools/install-git-hooks.js --check
node tools/build-publish-bundles.js
bash scripts/verify.sh

payload="$(node -e 'process.stdout.write(JSON.stringify({ message: process.argv[1] }))' "$message")"
curl --fail-with-body -sS -X POST http://localhost:3005/git/save \
  -H "Content-Type: application/json" \
  -d "$payload" \
  -K - <<AUTH_HEADERS
header = "X-Container-Secret: ${secret}"
header = "X-Provisioning-Generation: ${generation}"
header = "X-Provisioning-Token: ${token}"
AUTH_HEADERS
printf '\n'

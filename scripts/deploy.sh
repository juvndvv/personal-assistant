#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

usage() {
  cat <<'USAGE'
Usage: scripts/deploy.sh <tag>

Deploys an immutable release tag (for example v1.4.0) built by .github/workflows/release.yml:
pulls the app and backup images, pins them in the env file, starts the production stack
(migrations run once through the migrate service), and smoke-tests /up.

Environment:
  ENV_FILE                compose env file (default: .env)
  IMAGE_REPOSITORY        image repository without tag (default: APP_IMAGE in ENV_FILE minus its tag),
                          for example ghcr.io/owner/personal-finance
  DEPLOY_SMOKE_URL        optional public URL checked after the deploy, for example https://finanzas.example.com/up
  DEPLOY_SMOKE_INSECURE   set to 1 to skip TLS verification of DEPLOY_SMOKE_URL (Caddy internal CA)
  DEPLOY_WAIT_TIMEOUT     seconds to wait for healthy services (default: 300)
USAGE
}

log() {
  printf 'deploy: %s\n' "$*" >&2
}

die() {
  printf 'deploy: ERROR %s\n' "$*" >&2
  exit 1
}

(($# == 1)) || { usage >&2; exit 2; }
[[ "$1" == "-h" || "$1" == "--help" ]] && { usage; exit 0; }

tag="$1"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]] || die "'${tag}' is not a release tag like v1.2.3"

env_file="${ENV_FILE:-.env}"
[[ -f "$env_file" ]] || die "missing ${env_file}; copy .env.example and follow docs/ops/deploy.md"

env_value() {
  sed -n "s/^$1=//p" "$env_file" | tail -n 1 | sed -E "s/^[\"'](.*)[\"']$/\\1/"
}

set_env_value() {
  local key="$1" value="$2" updated
  updated="$(mktemp "${env_file}.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { written = 0 }
    index($0, key "=") == 1 { if (!written) { print key "=" value; written = 1 }; next }
    { print }
    END { if (!written) print key "=" value }
  ' "$env_file" > "$updated"
  chmod --reference="$env_file" "$updated" 2>/dev/null || chmod 0600 "$updated"
  mv "$updated" "$env_file"
}

previous_app_image="$(env_value APP_IMAGE)"
repository="${IMAGE_REPOSITORY:-${previous_app_image%:*}}"
[[ -n "$repository" && "$repository" == */* ]] || die "set IMAGE_REPOSITORY or APP_IMAGE (for example ghcr.io/owner/personal-finance:v0.1.0) in ${env_file}"
[[ "$repository" != *OWNER* ]] || die "replace OWNER in APP_IMAGE with your GitHub owner (lowercase)"

app_image="${repository}:${tag}"
backup_image="${repository}-backup:${tag}"
compose=(docker compose --env-file "$env_file" -f compose.yaml -f compose.prod.yaml)

log "pulling ${app_image} and ${backup_image}"
docker pull --quiet "$app_image" >/dev/null || die "cannot pull ${app_image} (docker login ghcr.io for private packages)"
docker pull --quiet "$backup_image" >/dev/null || die "cannot pull ${backup_image}"

set_env_value APP_IMAGE "$app_image"
set_env_value BACKUP_IMAGE "$backup_image"
export APP_IMAGE="$app_image" BACKUP_IMAGE="$backup_image"

"${compose[@]}" config --quiet

log "starting the stack (migrate runs before web, worker and scheduler)"
if ! "${compose[@]}" up -d --wait --wait-timeout "${DEPLOY_WAIT_TIMEOUT:-300}" --remove-orphans; then
  "${compose[@]}" ps -a >&2 || true
  "${compose[@]}" logs --no-color --tail=80 migrate web backup >&2 || true
  die "the stack did not become healthy; previous image was ${previous_app_image:-unknown}"
fi

migrate_container="$("${compose[@]}" ps -a -q migrate)"
[[ -n "$migrate_container" ]] || die "the migrate service did not run"
[[ "$(docker inspect -f '{{.State.ExitCode}}' "$migrate_container")" == "0" ]] || die "migrate exited with an error"
log "ok   migrations applied by the migrate service"

"${compose[@]}" exec -T web curl -fsS -o /dev/null http://localhost:2080/up || die "web /up is not healthy"
log "ok   web /up"

if [[ -n "${DEPLOY_SMOKE_URL:-}" ]]; then
  curl_args=(-fsS -o /dev/null -D - --max-time 15)
  [[ "${DEPLOY_SMOKE_INSECURE:-0}" == "1" ]] && curl_args+=(-k)
  headers="$(curl "${curl_args[@]}" "$DEPLOY_SMOKE_URL")" || die "${DEPLOY_SMOKE_URL} did not answer 2xx"
  grep -qi '^strict-transport-security:' <<< "$headers" || die "${DEPLOY_SMOKE_URL} has no Strict-Transport-Security header"
  log "ok   ${DEPLOY_SMOKE_URL} with HSTS"
fi

"${compose[@]}" ps
log "deployed ${tag}"
if [[ -n "$previous_app_image" && "$previous_app_image" != "$app_image" ]]; then
  log "rollback: scripts/deploy.sh ${previous_app_image##*:} (migrations are not reverted; see docs/ops/deploy.md)"
fi

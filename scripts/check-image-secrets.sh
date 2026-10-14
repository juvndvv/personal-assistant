#!/usr/bin/env bash
set -euo pipefail

if (($# == 0)); then
  echo "Usage: scripts/check-image-secrets.sh IMAGE [IMAGE...]" >&2
  exit 2
fi

sensitive_variable='(^|_)(KEY|SECRET|PASSWORD|PASS|TOKEN|CREDENTIALS?|PRIVATE|RECIPIENT)($|_)|^(APP_KEY|DB_PASSWORD|OPENAI_|ANTHROPIC_|GEMINI_|MISTRAL_|GROQ_|AWS_|RCLONE_CONFIG_|BACKUP_AGE_)'
allowed_variables='^(GPG_KEYS|PHP_SHA256|PHP_ASC_URL|PG_SHA256|PHPIZE_DEPS)$'
secret_content='AGE-SECRET-KEY-1|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|sk-(proj-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|APP_KEY=base64:[A-Za-z0-9+/=]{20,}'
secret_file_names='(^|/)(\.env(\.[A-Za-z0-9_-]+)?|rclone\.conf|auth\.json|id_(rsa|ed25519|ecdsa)|[^/]*\.(pem|key|p12|pfx|agekey))$'
allowed_files='(^|/)\.env\.example$|^(etc/ssl[0-9.]*|usr/share/ca-certificates|usr/local/share/ca-certificates|etc/ca-certificates)/|^usr/lib/python[0-9.]+/|^app/vendor/[^/]+/[^/]+/(tests?|fixtures?|Tests?)/'
content_scan_roots='^(app|etc/frankenphp|usr/local/etc|usr/local/bin|backups|config|root|home)/'

failures=0

fail() {
  printf 'image-secrets: FAIL %s\n' "$1" >&2
  failures=$((failures + 1))
}

check_image() {
  local image="$1"
  local name value line

  while IFS= read -r line; do
    name="${line%%=*}"
    value="${line#*=}"
    [[ "$name" =~ $allowed_variables ]] && continue
    if [[ "$name" =~ $sensitive_variable && -n "$value" ]]; then
      fail "${image}: ENV ${name} is set in the image config"
    fi
    if grep -qE "$secret_content" <<< "$value"; then
      fail "${image}: ENV ${name} contains secret-looking content"
    fi
  done < <(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image")

  if docker history --no-trunc --format '{{.CreatedBy}}' "$image" | grep -nE "$secret_content" >&2; then
    fail "${image}: a layer command contains secret-looking content (listed above)"
  fi
  if docker history --no-trunc --format '{{.CreatedBy}}' "$image" \
    | grep -oE '(^|[[:space:]])(ARG|ENV)?[[:space:]]*[A-Z0-9_]+=[^[:space:]]+' \
    | sed -E 's/^[[:space:]]*(ARG|ENV)?[[:space:]]*//' \
    | while IFS='=' read -r name value; do
        if [[ ! "$name" =~ $allowed_variables && "$name" =~ $sensitive_variable && -n "$value" && ! "$value" =~ ^[a-f0-9]{64}$ ]]; then
          printf '%s\n' "$name"
        fi
      done | sort -u | grep . >&2; then
    fail "${image}: a build argument or ENV with a sensitive name has a value in the history (listed above)"
  fi

  local container listing
  container="$(docker create "$image")"
  listing="$(mktemp)"
  docker export "$container" | tar -t > "$listing"

  if grep -E "$secret_file_names" "$listing" | grep -vE "$allowed_files" >&2; then
    fail "${image}: secret-looking files are present (listed above)"
  fi

  local scan_dir members
  scan_dir="$(mktemp -d)"
  members="$(mktemp)"
  grep -E "$content_scan_roots" "$listing" | grep -vE '/$|^app/(vendor|public/app|node_modules)/' > "$members" || true
  if [[ -s "$members" ]]; then
    docker export "$container" | tar -x -C "$scan_dir" -T "$members"
  fi
  if grep -rIlE "$secret_content" "$scan_dir" 2>/dev/null | sed "s#^${scan_dir}/##" | grep -vE "$allowed_files" >&2; then
    fail "${image}: files with secret-looking content are present (listed above)"
  fi

  docker rm "$container" >/dev/null
  rm -rf "$scan_dir" "$listing" "$members"

  if ((failures == 0)); then
    printf 'image-secrets: ok   %s (env, layer history, file names and contents)\n' "$image"
  fi
}

for image in "$@"; do
  check_image "$image"
done

if ((failures > 0)); then
  printf 'image-secrets: %d problem(s) found\n' "$failures" >&2
  exit 1
fi

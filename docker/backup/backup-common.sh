#!/usr/bin/env bash
# shellcheck disable=SC2034

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_SOURCE_STORAGE="${BACKUP_SOURCE_STORAGE:-/data/appstorage}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_STALE_AFTER_HOURS="${BACKUP_STALE_AFTER_HOURS:-26}"
BACKUP_PREFIX="${BACKUP_PREFIX:-pf}"
heartbeat_file="${BACKUP_DIR}/.last-success"
initialized_file="${BACKUP_DIR}/.initialized"

log() {
  printf '%s backup: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >&2
}

die() {
  log "ERROR $*"
  exit 1
}

require_env() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || die "${name} is not set"
  done
}

recipient_args() {
  local recipient
  local -a args=()
  for recipient in ${BACKUP_AGE_RECIPIENT//,/ }; do
    args+=(-r "$recipient")
  done
  ((${#args[@]} > 0)) || die "BACKUP_AGE_RECIPIENT has no recipient"
  printf '%s\n' "${args[@]}"
}

validate_recipients() {
  local -a args
  mapfile -t args < <(recipient_args)
  [[ "$BACKUP_AGE_RECIPIENT" != *AGE-SECRET-KEY* ]] || die "BACKUP_AGE_RECIPIENT must be a public key (age1...), never the private key"
  printf 'probe' | age "${args[@]}" >/dev/null || die "BACKUP_AGE_RECIPIENT is not a valid age recipient"
}

validate_retention() {
  [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_RETENTION_DAYS must be a positive integer"
  [[ "$BACKUP_STALE_AFTER_HOURS" =~ ^[1-9][0-9]*$ ]] || die "BACKUP_STALE_AFTER_HOURS must be a positive integer"
}

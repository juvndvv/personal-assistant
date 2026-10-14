#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=docker/backup/backup-common.sh
source /usr/local/lib/backup/backup-common.sh

reference_file="$heartbeat_file"
[[ -f "$reference_file" ]] || reference_file="$initialized_file"
[[ -f "$reference_file" ]] || { echo "no heartbeat and not initialized"; exit 1; }

reference_epoch="$(cat "$reference_file")"
[[ "$reference_epoch" =~ ^[0-9]+$ ]] || { echo "unreadable heartbeat in ${reference_file}"; exit 1; }

elapsed_seconds=$(( $(date +%s) - reference_epoch ))
limit_seconds=$(( BACKUP_STALE_AFTER_HOURS * 3600 ))

if (( elapsed_seconds > limit_seconds )); then
  echo "stale: last successful backup $(( elapsed_seconds / 3600 )) h ago (limit ${BACKUP_STALE_AFTER_HOURS} h, reference ${reference_file##*/})"
  exit 1
fi

echo "ok: $(( elapsed_seconds / 60 )) min since ${reference_file##*/}"

#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=docker/backup/backup-common.sh
source /usr/local/lib/backup/backup-common.sh

require_env BACKUP_AGE_RECIPIENT BACKUP_REMOTE BACKUP_SCHEDULE PGHOST PGUSER PGPASSWORD PGDATABASE
validate_recipients
validate_retention

mkdir -p "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"
[[ -f "$initialized_file" ]] || date +%s > "$initialized_file"

mkdir -p /etc/backup
printf '%s /usr/local/bin/backup-run\n' "$BACKUP_SCHEDULE" > /etc/backup/crontab

log "schedule '${BACKUP_SCHEDULE}' (${TZ:-UTC}), remote '${BACKUP_REMOTE}', retention ${BACKUP_RETENTION_DAYS} days, stale after ${BACKUP_STALE_AFTER_HOURS} h"

exec "$@"

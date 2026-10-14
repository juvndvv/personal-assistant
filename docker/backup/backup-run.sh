#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=docker/backup/backup-common.sh
source /usr/local/lib/backup/backup-common.sh

volatile_tables="'cache','cache_locks','sessions','jobs','job_batches','failed_jobs'"

require_env BACKUP_AGE_RECIPIENT BACKUP_REMOTE PGHOST PGUSER PGPASSWORD PGDATABASE
validate_retention
mapfile -t recipients < <(recipient_args)

mkdir -p "$BACKUP_DIR"
exec 9>"${BACKUP_DIR}/.lock"
flock -n 9 || die "another backup is already running"

find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -delete

stamp="$(date +%Y%m%dT%H%M%S)"
base="${BACKUP_DIR}/${BACKUP_PREFIX}-${stamp}"
db_file="${base}-db.dump.age"
storage_file="${base}-storage.tar.gz.age"
manifest_file="${base}-manifest.txt.age"

scratch_dir="$(mktemp -d "${BACKUP_DIR}/.run.XXXXXX")"
snapshot_sentinel="__pf_backup_snapshot_end__"
snapshot_pid=""

cleanup() {
  rm -f "${db_file}.partial" "${storage_file}.partial" "${manifest_file}.partial"
  rm -rf "$scratch_dir"
  if [[ -n "$snapshot_pid" ]]; then
    kill "$snapshot_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

encrypt_to() {
  age "${recipients[@]}" -o "$1"
}

open_snapshot_session() {
  coproc SNAPSHOT_SESSION { psql -X -A -t -q -v ON_ERROR_STOP=1 -F ' '; }
  snapshot_pid="$SNAPSHOT_SESSION_PID"
  exec {snapshot_out}<&"${SNAPSHOT_SESSION[0]}" {snapshot_in}>&"${SNAPSHOT_SESSION[1]}"
}

in_snapshot() {
  local line
  printf '%s\n\\echo %s\n' "$1" "$snapshot_sentinel" >&"$snapshot_in"
  while IFS= read -r line <&"$snapshot_out"; do
    [[ "$line" == "$snapshot_sentinel" ]] && return 0
    printf '%s\n' "$line"
  done
  die "the snapshot session ended unexpectedly"
}

close_snapshot_session() {
  in_snapshot 'COMMIT;' >/dev/null
  printf '\\q\n' >&"$snapshot_in"
  exec {snapshot_in}>&- {snapshot_out}<&-
  wait "$snapshot_pid" || die "the snapshot session failed"
  snapshot_pid=""
}

row_counts_sql="SELECT format('SELECT %L, count(*) FROM %I.%I', tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'public' AND tablename NOT IN (${volatile_tables})
ORDER BY tablename
\\gexec"

referenced_receipts_sql="SELECT './private/receipts/' || path FROM attachments WHERE disk = 'receipts' ORDER BY 1;"

archive_storage() {
  local listing_fifo="${scratch_dir}/listing.fifo"
  local listing_pid
  mkfifo "$listing_fifo"
  tar -tzf - < "$listing_fifo" > "$archived_entries" &
  listing_pid=$!
  tar -C "$BACKUP_SOURCE_STORAGE" -czf - . | tee "$listing_fifo" | encrypt_to "${storage_file}.partial"
  wait "$listing_pid" || die "could not list the storage archive"
  rm -f "$listing_fifo"
}

log "starting ${BACKUP_PREFIX}-${stamp}"

archived_entries="${scratch_dir}/archived-entries"
referenced_receipts="${scratch_dir}/referenced-receipts"

open_snapshot_session
in_snapshot 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' >/dev/null
snapshot_id="$(in_snapshot 'SELECT pg_export_snapshot();')"
[[ -n "$snapshot_id" ]] || die "could not export a database snapshot"
counts="$(in_snapshot "$row_counts_sql")"
in_snapshot "$referenced_receipts_sql" > "$referenced_receipts"
pg_dump --snapshot="$snapshot_id" --format=custom --compress=6 | encrypt_to "${db_file}.partial"
close_snapshot_session

archive_storage
storage_files="$(grep -vc '/$' "$archived_entries" || true)"
missing_receipts="$(LC_ALL=C comm -23 <(LC_ALL=C sort -u "$referenced_receipts") <(LC_ALL=C sort -u "$archived_entries") | wc -l | tr -d ' ')"
((missing_receipts == 0)) || die "${missing_receipts} receipt(s) referenced by the database dump are missing from the storage archive; run the backup again"

{
  printf 'backup %s-%s\n' "$BACKUP_PREFIX" "$stamp"
  printf 'created_at %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')"
  printf 'pg_dump %s\n' "$(pg_dump --version | awk '{print $NF}')"
  printf 'database %s\n' "$PGDATABASE"
  printf 'sha256 %s %s\n' "$(sha256sum "${db_file}.partial" | cut -d ' ' -f 1)" "${db_file##*/}"
  printf 'sha256 %s %s\n' "$(sha256sum "${storage_file}.partial" | cut -d ' ' -f 1)" "${storage_file##*/}"
  printf 'storage_files %s\n' "$storage_files"
  while read -r table count; do
    [[ -n "$table" ]] && printf 'rows %s %s\n' "$table" "$count"
  done <<< "$counts"
} | encrypt_to "${manifest_file}.partial"

for file in "$db_file" "$storage_file" "$manifest_file"; do
  mv "${file}.partial" "$file"
done
chmod 0600 "$db_file" "$storage_file" "$manifest_file"
log "encrypted $(du -h "$db_file" | cut -f 1) database dump and $(du -h "$storage_file" | cut -f 1) storage archive (${storage_files} files)"

rclone copy --no-traverse --max-depth 1 --include "${BACKUP_PREFIX}-${stamp}-*" "$BACKUP_DIR" "$BACKUP_REMOTE"
log "uploaded to ${BACKUP_REMOTE}"

retention_minutes=$(( BACKUP_RETENTION_DAYS * 24 * 60 ))
pruned_locally="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${BACKUP_PREFIX}-*.age" -mmin "+${retention_minutes}" -print -delete | wc -l | tr -d ' ')"
rclone delete --min-age "${BACKUP_RETENTION_DAYS}d" --include "${BACKUP_PREFIX}-*.age" "$BACKUP_REMOTE"
log "pruned ${pruned_locally} local file(s) and remote files older than ${BACKUP_RETENTION_DAYS} days"

date +%s > "$heartbeat_file"
printf '%s-%s\n' "$BACKUP_PREFIX" "$stamp" > "${BACKUP_DIR}/.last-backup"
log "done ${BACKUP_PREFIX}-${stamp}"

#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

app_image="${APP_IMAGE:-personal-finance:local}"
backup_image="${BACKUP_IMAGE:-personal-finance-backup:local}"
source_project="${DRILL_SOURCE_PROJECT:-pf-drill-source}"
report="${DRILL_REPORT:-}"

log() {
  printf 'drill: %s\n' "$*" >&2
}

die() {
  printf 'drill: FAIL %s\n' "$*" >&2
  exit 1
}

for image in "$app_image" "$backup_image"; do
  docker image inspect "$image" >/dev/null 2>&1 || die "image ${image} is missing (make build-image build-backup-image)"
done

workdir="$(mktemp -d "${TMPDIR:-/tmp}/pf-drill.XXXXXX")"
chmod 0700 "$workdir"
mkdir -p "$workdir/offsite"
env_file="$workdir/source.env"
overlay="$workdir/compose.drill.yaml"

compose() {
  docker compose -p "$source_project" --env-file "$env_file" -f compose.yaml -f compose.prod.yaml -f "$overlay" "$@"
}

cleanup() {
  local status=$?
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$workdir"
  ((status == 0)) || log "FAILED (exit ${status})"
}
trap cleanup EXIT

tools() {
  docker run --rm --entrypoint "" --user "$(id -u):$(id -g)" -v "$workdir:/work" "$backup_image" "$@"
}

tools age-keygen -o /work/identity.txt 2>/dev/null
tools age-keygen -o /work/other-identity.txt 2>/dev/null
recipient="$(tools age-keygen -y /work/identity.txt)"

{
  grep -vE '^(APP_KEY|APP_IMAGE|BACKUP_IMAGE|DB_PASSWORD|HTTP_PORT|HTTPS_PORT|BACKUP_[A-Z_]+)=' .env.example
  printf 'APP_KEY=base64:%s\n' "$(openssl rand -base64 32)"
  printf 'APP_IMAGE=%s\nBACKUP_IMAGE=%s\n' "$app_image" "$backup_image"
  printf 'DB_PASSWORD=%s\n' "$(openssl rand -hex 16)"
  printf 'HTTP_PORT=0\nHTTPS_PORT=0\n'
  printf 'BACKUP_AGE_RECIPIENT=%s\nBACKUP_REMOTE=/offsite\n' "$recipient"
} > "$env_file"
cat > "$overlay" <<YAML
services:
  backup:
    volumes:
      - ${workdir}/offsite:/offsite
YAML

log "starting the source stack ${source_project}"
compose up -d --wait --wait-timeout 240 >/dev/null

printf 'drill-password-%s' "$(openssl rand -hex 8)" \
  | compose exec -T web php artisan app:create-user drill@example.com --name=Drill --password-stdin --with-defaults >/dev/null
compose exec -T web php artisan db:seed --class='Database\Seeders\DevSeeder' --force --no-interaction >/dev/null
receipt_sha="$(compose exec -T web sh -c 'mkdir -p storage/app/private/receipts/drill && head -c 4096 /dev/urandom > storage/app/private/receipts/drill/receipt.jpg && sha256sum storage/app/private/receipts/drill/receipt.jpg' | cut -d ' ' -f 1)"
compose exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
INSERT INTO attachments (id, transaction_id, kind, disk, path, mime, size_bytes, sha256, created_at, updated_at)
SELECT '01JDRILLRECEIPT00000000000', id, 'image', 'receipts', 'drill/receipt.jpg', 'image/jpeg', 4096, '${receipt_sha}', now(), now()
FROM transactions ORDER BY id LIMIT 1;
SQL
compose exec -T web php artisan app:ledger:verify >/dev/null
log "ok   source seeded (DevSeeder, one receipt) and app:ledger:verify passes"

compose exec -T backup backup-run 2>&1 | grep -v NOTICE >&2
backup_name="$(compose exec -T backup cat /backups/.last-backup | tr -d '\r\n')"
for part in db.dump storage.tar.gz manifest.txt; do
  [[ -s "$workdir/offsite/${backup_name}-${part}.age" ]] || die "${backup_name}-${part}.age was not uploaded"
  [[ "$(head -c 21 "$workdir/offsite/${backup_name}-${part}.age")" == "age-encryption.org/v1" ]] || die "${part} is not an age file"
done
log "ok   ${backup_name} uploaded off-server as three age files"

if tools pg_restore -l "/work/offsite/${backup_name}-db.dump.age" >/dev/null 2>&1; then
  die "the encrypted dump is readable by pg_restore"
fi
if tools age -d -i /work/other-identity.txt -o /dev/null "/work/offsite/${backup_name}-db.dump.age" 2>/dev/null; then
  die "a different identity decrypted the dump"
fi
if grep -rqF 'drill@example.com' "$workdir/offsite"; then
  die "plaintext data found in the off-site files"
fi
compose exec -T backup sh -c 'env | grep -q AGE-SECRET-KEY' && die "the backup container holds a private key"
log "ok   archives are unreadable without the private key; the server only has the recipient"

old_name="${backup_name%%-*}-20000101T030000"
for part in db.dump storage.tar.gz manifest.txt; do
  printf 'expired' > "$workdir/offsite/${old_name}-${part}.age"
  touch -t 200001010300 "$workdir/offsite/${old_name}-${part}.age"
done
compose exec -T backup sh -c "printf expired > /backups/${old_name}-db.dump.age && touch -t 200001010300 /backups/${old_name}-db.dump.age"
compose exec -T backup backup-run 2>&1 | grep -v NOTICE >&2
ls "$workdir/offsite/${old_name}-"* >/dev/null 2>&1 && die "remote copies older than 30 days were not pruned"
compose exec -T backup test ! -e "/backups/${old_name}-db.dump.age" || die "local copies older than 30 days were not pruned"
[[ -s "$workdir/offsite/${backup_name}-db.dump.age" ]] || die "a fresh backup was pruned"
log "ok   copies older than 30 days pruned locally and remotely; fresh ones kept"

compose exec -T backup backup-healthcheck >/dev/null || die "healthcheck fails right after a backup"
compose exec -T backup sh -c 'cp /backups/.last-success /tmp/last-success && echo $(( $(date +%s) - 27 * 3600 )) > /backups/.last-success'
if compose exec -T backup backup-healthcheck >/dev/null; then
  die "healthcheck stays healthy 27 h after the last success"
fi
compose exec -T backup sh -c 'cp /tmp/last-success /backups/.last-success'
log "ok   healthcheck turns unhealthy 27 h after the last success (limit 26 h)"

restore_started="$(date +%s)"
scripts/restore.sh --identity "$workdir/identity.txt" --source "$workdir/offsite" \
  --app-image "$app_image" --backup-image "$backup_image" 2>&1 \
  | grep -v NOTICE | tee "$workdir/restore.log" >&2
restore_seconds=$(( $(date +%s) - restore_started ))
restored_name="$(sed -n 's/^restore: restore of \([^ ]*\) verified in project.*/\1/p' "$workdir/restore.log")"
[[ -n "$restored_name" ]] || die "restore.sh did not verify the restore"
log "ok   restore.sh restored the newest backup ${restored_name} into a scratch project and verified it in ${restore_seconds} s"

if [[ -n "$report" ]]; then
  cp "$workdir/restore.log" "$report"
fi
log "restore drill passed"

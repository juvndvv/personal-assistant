#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

usage() {
  cat <<'USAGE'
Usage: scripts/restore.sh --identity FILE --source SOURCE [options]

Fetches an encrypted backup, decrypts it with the off-server age identity, restores the
database and the storage volume into a compose project, and verifies it (sha256 of the
archives, row counts against the backup manifest, receipt checksums, migrate,
app:ledger:verify).

Required:
  --identity FILE      age identity (private key) file; it never lives on the server
  --source SOURCE      rclone remote path (for example b2:my-bucket/personal-finance)
                       or a local directory holding the .age files

Options:
  --backup NAME        backup to restore, for example pf-20261014T030000 (default: newest)
  --project NAME       compose project to restore into (default: pf-restore-drill)
  --env-file FILE      compose env file for that project (default: a scratch env built
                       from .env.example with a fresh APP_KEY and DB password)
  --app-image IMAGE    image used for migrate and app:ledger:verify (default: APP_IMAGE from
                       the env file, else personal-finance:local)
  --backup-image IMAGE image with age and rclone (default: BACKUP_IMAGE or
                       personal-finance-backup:local, built from docker/backup when missing)
  --rclone-env FILE    env file with RCLONE_CONFIG_* for the remote (default: .env.backup when present)
  --keep               leave the restored stack running (implied with --project)
  --replace            delete existing volumes of the target project before restoring
  -h, --help           show this help
USAGE
}

log() {
  printf 'restore: %s\n' "$*" >&2
}

die() {
  printf 'restore: ERROR %s\n' "$*" >&2
  exit 1
}

identity=""
source_location=""
backup_name=""
project="pf-restore-drill"
project_given=false
env_file=""
app_image=""
backup_image="${BACKUP_IMAGE:-personal-finance-backup:local}"
rclone_env=""
keep=false
replace=false

while (($# > 0)); do
  case "$1" in
    --identity) identity="${2:?--identity needs a file}"; shift 2 ;;
    --source) source_location="${2:?--source needs a value}"; shift 2 ;;
    --backup) backup_name="${2:?--backup needs a name}"; shift 2 ;;
    --project) project="${2:?--project needs a name}"; project_given=true; shift 2 ;;
    --env-file) env_file="${2:?--env-file needs a file}"; shift 2 ;;
    --app-image) app_image="${2:?--app-image needs an image}"; shift 2 ;;
    --backup-image) backup_image="${2:?--backup-image needs an image}"; shift 2 ;;
    --rclone-env) rclone_env="${2:?--rclone-env needs a file}"; shift 2 ;;
    --keep) keep=true; shift ;;
    --replace) replace=true; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

[[ -n "$identity" ]] || { usage >&2; die "--identity is required"; }
[[ -n "$source_location" ]] || { usage >&2; die "--source is required"; }
[[ -r "$identity" ]] || die "cannot read identity file ${identity}"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "invalid compose project name '${project}'"
[[ -z "$backup_name" || "$backup_name" =~ ^[A-Za-z0-9_-]+-[0-9]{8}T[0-9]{6}$ ]] || die "invalid backup name '${backup_name}'"
$project_given && keep=true
if [[ -z "$rclone_env" && -f .env.backup ]]; then
  rclone_env=.env.backup
fi
[[ -z "$rclone_env" || -r "$rclone_env" ]] || die "cannot read rclone env file ${rclone_env}"

identity="$(cd "$(dirname "$identity")" && pwd)/$(basename "$identity")"
workdir="$(mktemp -d "${TMPDIR:-/tmp}/pf-restore.XXXXXX")"
chmod 0700 "$workdir"
mkdir -p "$workdir/encrypted" "$workdir/plain"
stack_started=false

compose() {
  docker compose -p "$project" --env-file "$env_file" -f compose.yaml "$@"
}

cleanup() {
  local status=$?
  if $stack_started && ! $keep; then
    log "tearing down scratch project ${project}"
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$workdir"
  if ((status != 0)); then
    log "FAILED (exit ${status})"
  fi
}
trap cleanup EXIT

tools() {
  local -a args=(--rm --entrypoint "" --user "$(id -u):$(id -g)" -e HOME=/work
    -v "$workdir:/work" -v "$identity:/identity:ro")
  [[ -n "$rclone_env" ]] && args+=(--env-file "$rclone_env")
  [[ -n "$local_source" ]] && args+=(-v "$local_source:/source:ro")
  docker run "${args[@]}" "$backup_image" "$@"
}

ensure_backup_image() {
  if ! docker image inspect "$backup_image" >/dev/null 2>&1; then
    if [[ "$backup_image" == */* ]]; then
      docker pull "$backup_image" >/dev/null || die "cannot pull ${backup_image}"
    else
      log "building ${backup_image} from docker/backup"
      docker build -q -t "$backup_image" docker/backup >/dev/null
    fi
  fi
}

prepare_env_file() {
  if [[ -n "$env_file" ]]; then
    [[ -r "$env_file" ]] || die "cannot read env file ${env_file}"
    return
  fi
  env_file="$workdir/compose.env"
  {
    grep -vE '^(APP_KEY|DB_PASSWORD|APP_IMAGE|HTTP_PORT|HTTPS_PORT)=' .env.example
    printf 'APP_KEY=base64:%s\n' "$(openssl rand -base64 32)"
    printf 'DB_PASSWORD=%s\n' "$(openssl rand -hex 16)"
    printf 'APP_IMAGE=%s\n' "${app_image:-personal-finance:local}"
    printf 'HTTP_PORT=0\nHTTPS_PORT=0\n'
  } > "$env_file"
  chmod 0600 "$env_file"
}

local_source=""
if [[ -d "$source_location" ]]; then
  local_source="$(cd "$source_location" && pwd)"
  rclone_source=/source
else
  rclone_source="$source_location"
fi

ensure_backup_image
prepare_env_file
if [[ -n "$app_image" ]]; then
  export APP_IMAGE="$app_image"
fi

if [[ -z "$backup_name" ]]; then
  backup_name="$(tools rclone lsf --files-only --include '*-db.dump.age' "$rclone_source" | sed 's/-db\.dump\.age$//' | sort | tail -n 1)"
  [[ -n "$backup_name" ]] || die "no backups found in ${source_location}"
fi
log "restoring ${backup_name} from ${source_location} into project ${project}"

tools rclone copy --include "${backup_name}-*.age" "$rclone_source" /work/encrypted
for part in db.dump storage.tar.gz manifest.txt; do
  [[ -s "$workdir/encrypted/${backup_name}-${part}.age" ]] || die "missing ${backup_name}-${part}.age in ${source_location}"
done

tools age -d -i /identity -o "/work/plain/manifest.txt" "/work/encrypted/${backup_name}-manifest.txt.age" \
  || die "cannot decrypt the manifest with ${identity}"
manifest="$workdir/plain/manifest.txt"

while read -r _ expected file; do
  actual="$(tools sha256sum "/work/encrypted/${file}" | cut -d ' ' -f 1)"
  [[ "$actual" == "$expected" ]] || die "sha256 mismatch for ${file}"
  log "ok   sha256 ${file}"
done < <(grep '^sha256 ' "$manifest")

tools age -d -i /identity -o /work/plain/db.dump "/work/encrypted/${backup_name}-db.dump.age"
tools age -d -i /identity -o /work/plain/storage.tar.gz "/work/encrypted/${backup_name}-storage.tar.gz.age"
log "ok   decrypted database dump and storage archive"

existing_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=${project}")"
if [[ -n "$existing_volumes" ]]; then
  $replace || die "project ${project} already has volumes (${existing_volumes//$'\n'/ }); pass --replace to delete them"
  log "deleting existing volumes of ${project}"
  compose down -v --remove-orphans
fi

stack_started=true
compose up -d --wait db
compose exec -T db sh -c 'pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$workdir/plain/db.dump"
log "ok   pg_restore"

storage_volume="${project}_appstorage"
docker volume create --label "com.docker.compose.project=${project}" --label com.docker.compose.volume=appstorage "$storage_volume" >/dev/null
docker run --rm --entrypoint "" -v "$storage_volume:/data/appstorage" -v "$workdir/plain:/work:ro" "$backup_image" \
  tar -xzf /work/storage.tar.gz -C /data/appstorage
log "ok   storage archive extracted into ${storage_volume}"

row_counts_sql="SELECT format('SELECT %L, count(*) FROM %I.%I', tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'public' AND tablename NOT IN ('cache','cache_locks','sessions','jobs','job_batches','failed_jobs')
ORDER BY tablename
\\gexec"
restored_counts="$(compose exec -T db sh -c 'psql -X -A -t -v ON_ERROR_STOP=1 -F " " -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<< "$row_counts_sql")"

count_failures=0
printf '%-28s %10s %10s\n' table backup restored >&2
while read -r _ table expected; do
  actual="$(awk -v t="$table" '$1 == t {print $2}' <<< "$restored_counts")"
  printf '%-28s %10s %10s\n' "$table" "$expected" "${actual:-missing}" >&2
  [[ "$actual" == "$expected" ]] || count_failures=$((count_failures + 1))
done < <(grep '^rows ' "$manifest")
((count_failures == 0)) || die "${count_failures} table(s) differ from the backup manifest"
log "ok   row counts match the manifest"

expected_files="$(awk '$1 == "storage_files" {print $2}' "$manifest")"
restored_files="$(docker run --rm --entrypoint "" -v "$storage_volume:/data/appstorage:ro" "$backup_image" sh -c 'find /data/appstorage -type f | wc -l' | tr -d ' ')"
[[ "$restored_files" == "$expected_files" ]] || die "storage has ${restored_files} files, the manifest lists ${expected_files}"
log "ok   ${restored_files} storage files restored"

receipt_checksums="$(compose exec -T db sh -c 'psql -X -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT sha256 || '  /data/appstorage/private/receipts/' || path
FROM attachments
WHERE disk = 'receipts'
ORDER BY path
SQL
)"
if [[ -n "$receipt_checksums" ]]; then
  docker run --rm -i --entrypoint "" -v "$storage_volume:/data/appstorage:ro" "$backup_image" sha256sum -c -s - <<< "$receipt_checksums" \
    || die "some receipts are missing or do not match their sha256"
  log "ok   $(wc -l <<< "$receipt_checksums" | tr -d ' ') receipt(s) match their attachments.sha256"
else
  log "ok   no receipts referenced by attachments"
fi

compose run --rm --no-deps -T worker php artisan migrate --force --no-interaction
compose run --rm --no-deps -T worker php artisan app:ledger:verify
log "ok   app:ledger:verify"

log "restore of ${backup_name} verified in project ${project}"
if $keep; then
  log "the stack is still running: docker compose -p ${project} -f compose.yaml ..."
fi

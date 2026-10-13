#!/usr/bin/env bash
set -euo pipefail

base_url="${E2E_BASE_URL:-https://localhost}"
receipts_dir=/app/storage/app/private/receipts
expected_upload_limit=12M
expected_max_execution_time=45
failures=0

pass() {
  printf 'smoke: ok   %s\n' "$1"
}

fail() {
  printf 'smoke: FAIL %s\n' "$1" >&2
  failures=$((failures + 1))
}

in_service() {
  local service="$1"
  shift
  docker compose exec -T "$service" "$@"
}

check_up_endpoint() {
  if curl -fsSk -o /dev/null "${base_url}/up"; then
    pass "GET ${base_url}/up returns 2xx"
  else
    fail "GET ${base_url}/up did not return 2xx"
  fi
}

check_database() {
  if in_service db pg_isready -q; then
    pass "db accepts connections (pg_isready)"
  else
    fail "db is not ready (pg_isready)"
  fi
}

check_php_limits() {
  local actual
  local effective_ini_settings
  effective_ini_settings="$(cat <<'PHP'
$files = array_filter([php_ini_loaded_file(), ...array_map("trim", explode(",", (string) php_ini_scanned_files()))]);
$settings = [];
foreach ($files as $file) {
    $settings = array_merge($settings, parse_ini_file($file, false, INI_SCANNER_RAW) ?: []);
}
echo $settings["upload_max_filesize"] ?? "", " ", $settings["post_max_size"] ?? "", " ", $settings["max_execution_time"] ?? "";
PHP
)"
  actual="$(in_service web php -r "$effective_ini_settings")"
  local expected="${expected_upload_limit} ${expected_upload_limit} ${expected_max_execution_time}"
  if [[ "$actual" == "$expected" ]]; then
    pass "php.ini upload_max_filesize/post_max_size/max_execution_time = ${expected}"
  else
    fail "php.ini limits are '${actual}', expected '${expected}'"
  fi
}

check_receipts_storage() {
  local service owner
  for service in web worker scheduler; do
    owner="$(in_service "$service" sh -c "test -d ${receipts_dir} && test -w ${receipts_dir} && stat -c '%u' ${receipts_dir}" 2>/dev/null || true)"
    if [[ "$owner" == "$(in_service "$service" id -u)" ]]; then
      pass "${service}: ${receipts_dir} exists, is writable and owned by the runtime user (uid ${owner})"
    else
      fail "${service}: ${receipts_dir} is missing, not writable or not owned by the runtime user"
    fi
  done
}

check_shared_receipts_volume() {
  local probe
  probe="smoke-$(date +%s)-$$"
  if in_service web sh -c "printf ok > ${receipts_dir}/${probe}" \
    && [[ "$(in_service scheduler cat "${receipts_dir}/${probe}" 2>/dev/null)" == "ok" ]] \
    && in_service scheduler rm -f "${receipts_dir}/${probe}"; then
    pass "web and scheduler share the receipts volume (scheduler can delete web files)"
  else
    in_service web rm -f "${receipts_dir}/${probe}" >/dev/null 2>&1 || true
    fail "web and scheduler do not share a writable receipts volume"
  fi
}

scheduled_task_at() {
  local schedule="$1" command="$2" expected_time="$3"
  in_service scheduler php -r '
    [$json, $command, $expectedTime] = [stream_get_contents(STDIN), $argv[1], $argv[2]];
    [$hour, $minute] = array_map("intval", explode(":", $expectedTime));
    foreach (json_decode($json, true, flags: JSON_THROW_ON_ERROR) as $task) {
        if (str_contains($task["command"], $command)
            && $task["expression"] === sprintf("%d %d * * *", $minute, $hour)
            && substr($task["next_due_date"], 11, 8) === sprintf("%02d:%02d:00", $hour, $minute)) {
            exit(0);
        }
    }
    exit(1);
  ' "$command" "$expected_time" <<< "$schedule"
}

check_schedule() {
  local schedule command expected_time entry
  printf '%s\n' "$(in_service scheduler php artisan schedule:list --timezone=Europe/Madrid --no-ansi 2>&1 || true)"
  schedule="$(in_service scheduler php artisan schedule:list --timezone=Europe/Madrid --json --no-ansi 2>/dev/null || true)"
  for entry in "app:drafts:purge 03:30" "app:recurring:generate 06:00"; do
    read -r command expected_time <<< "$entry"
    if scheduled_task_at "$schedule" "$command" "$expected_time"; then
      pass "scheduler lists ${command} daily at ${expected_time} Europe/Madrid"
    else
      fail "scheduler does not list ${command} daily at ${expected_time} Europe/Madrid"
    fi
  done
}

check_up_endpoint
check_database
check_php_limits
check_receipts_storage
check_shared_receipts_volume
check_schedule

if ((failures > 0)); then
  printf 'smoke: %d check(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'smoke: all checks passed\n'

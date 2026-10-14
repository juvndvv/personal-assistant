# QA log

Per-milestone QA results, manual device checks and performance numbers (see
`IMPLEMENTATION_PLAN.md` section 3). Newest entries at the bottom of each milestone.

## Pending manual items

| Item | Milestone | Status |
|---|---|---|
| Trust Caddy's local root CA on an iPhone and open the app over LAN/Tailscale (`docs/ops/local-https.md`) | M0 | pending |
| Install the PWA on iPhone (Safari, Add to Home Screen) and Android (Chrome) | M0 | pending |
| First CI run on GitHub (all five jobs green, GHA cache warm for `e2e`) | M0 | pending |
| iPhone Safari: voice (hold-to-talk, `audio/mp4` upload transcribed) and photo capture, review, confirm, receipt visible on the movement | M3 | pending |
| Installed PWA (iPhone and Android): voice and photo capture end to end with microphone and camera permissions | M3 | pending |
| `php artisan app:ai-eval tests/Fixtures/ai-eval` with real anonymized samples and `OPENAI_API_KEY`: per-field accuracy and latency (target p50 < 5 s) | M3 | pending |
| Capture `extraction_ms` p95: `php artisan app:ai-eval tests/Fixtures/ai-eval` with `OPENAI_API_KEY` (p95 line), then after real use `make capture-latency` on the production stack (`percentile_cont(0.95)` over `captures.extraction_ms` per kind); record both in the M8 section | M8 | pending |
| Production restore drill from the real off-site remote (`make restore`, then `app:ledger:verify`) | M8 | pending |

## M0 Foundation

### 2026-10-13 infra (host macOS, Docker 29.4.0 via OrbStack, Compose v5.1.2)

Host ports 80/443 were in use by another project, so the local runs used `HTTP_PORT=8080`,
`HTTPS_PORT=8443`, `DB_HOST_PORT=55432` and `SANCTUM_STATEFUL_DOMAINS=localhost,localhost:8443`.

| Check | Command | Result |
|---|---|---|
| Pinned images exist | `docker manifest inspect` on every tag in ADR-027 | all found |
| Dev compose config | `docker compose config -q` | valid |
| Prod compose config | `docker compose -f compose.yaml -f compose.prod.yaml config` | valid; `db` has no ports; `migrate` runs `php artisan migrate --force`, `restart: "no"`; `web`, `worker`, `scheduler` depend on it with `service_completed_successfully` and use `restart: unless-stopped` |
| Runtime image | `docker build --target runtime .` | success; runs as uid 1000 `app`; `pdo_pgsql intl zip bcmath pcntl` + OPcache loaded; `upload_max_filesize`/`post_max_size` 12M; Angular build in `public/app` |
| Dev stack | `docker compose up -d --wait` | `db`, `frontend`, `web` healthy; `migrate` exited 0; `worker` and `scheduler` running |
| HTTPS and routing (dev) | `curl -k https://localhost:8443/up`, `/login` | 200; Angular shell (`<title>Finanzas</title>`) proxied from `ng serve`; HTTP redirects to HTTPS (308) |
| Hot reload through `web` | edit `features/home/home.page.ts` | `ng serve` rebuilt and logged "Component update sent to client(s)"; WebSocket upgrade through Caddy returns 101 |
| Single user | `app:create-user e2e@example.com --password-stdin`, then a second user | first created; second refused with exit 1 ("A user already exists") |
| Sanctum cookie flow | `curl` with a cookie jar: `/sanctum/csrf-cookie`, login `remember=true`, `me`, logout, `me` | 204, 200 (+ `remember_web_*` cookie, `Secure` session and XSRF cookies), 200, 204, 401 |
| Login throttle | 6 failed logins for one email within a minute | 422 x5, then 429 |
| Register route | `POST /api/v1/auth/register` | 404 |
| Lint | `make lint` | `check-pins.sh` ok; Pint passed; PHPStan level 9 0 errors; ESLint all files pass; Prettier clean |
| Tests | `make test` (Pest against compose `db` `finance_test`, Vitest) | Pest 51 passed (131 assertions, parallel); Vitest 14 files, 129 passed |
| Service worker and manifest | `npx ng build` + CI `jq` checks | no `dataGroups`; no `/api`, `/sanctum`, `/up` asset URLs; `navigationUrls` exclude `/api/**`, `/sanctum/**`, `/up`; manifest has name, short_name, start_url, display, icons; no kitchen-sink chunk |
| Playwright m0-auth (dev stack) | `E2E_BASE_URL=https://localhost:8443 npx playwright test` | 8/8 passed (Chromium, WebKit) |
| Prod stack (CI e2e flow) | `compose.yaml` + `compose.prod.yaml`, `APP_IMAGE=personal-finance:local`, `up -d --wait` | `migrate` exited 0; `db`, `web` healthy; `web`, `worker`, `scheduler` run the same image |
| Prod caching headers | `curl -kI` | `/movimientos` (SPA fallback) and `/ngsw.json`: `Cache-Control: no-cache`; `main-<hash>.js`: `public, max-age=31536000, immutable`; unknown `/api/v1/*`: JSON 404 |
| Playwright m0-auth (prod stack) | user via `--password-stdin`, `npx playwright test` | 8/8 passed |
| `check-pins.sh` negative cases | scratch tree with `^`, `~`, `latest`, bare-major tags, `@v4` action, `ubuntu-latest` | all 12 problems reported, exit 1 |
| Workflow lint | `actionlint` 1.7.12, `shellcheck` 0.11.0 on scripts | clean |

Teardown: both stacks stopped with `down -v`; only the images `personal-finance:local` and
`personal-finance:dev` remain.

## M1 Ledger kernel

Acceptance checklist: `docs/plan/milestones/M1.md`.

### 2026-10-13 triage verification (host macOS, Docker via OrbStack)

The run used an isolated compose project so it did not collide with the default dev stack:
`COMPOSE_PROJECT_NAME` set to a scratch name, `COMPOSE_FILE=compose.yaml:compose.prod.yaml`,
`COMPOSE_ENV_FILES` pointing at a scratch env file, `APP_IMAGE=personal-finance:local` and
`HTTPS_PORT=18643`.

| Check | Command | Result |
|---|---|---|
| Runtime image | `docker build --target runtime -t personal-finance:local .` from the current tree | success |
| Prod compose config | `docker compose config -q` with the variables above | valid |
| Stack up | `docker compose up -d --wait` | `migrate` exited 0; `db`, `web` healthy |
| Single user | `docker compose exec -T web php artisan app:create-user ... --password-stdin` | created |
| Dev seed | `docker compose exec -T web php artisan db:seed --class=DevSeeder --force` | seeded accounts of all four types and sample movements |
| Ledger invariants | `docker compose exec -T web php artisan app:ledger:verify` | printed `Ledger OK`, exit 0 |
| Playwright M0 + M1 | `E2E_BASE_URL=https://localhost:18643 npx playwright test` | 17/17 passed (setup + `m0-auth` + `m1-ledger`, Chromium and WebKit) |

Note: `frontend/e2e/global-setup.ts` resets the login throttle with
`docker compose exec -T web php artisan cache:clear` from the repository root. When the stack is
not the default compose project, export the same `COMPOSE_PROJECT_NAME`, `COMPOSE_FILE` and
`COMPOSE_ENV_FILES` in the shell that runs Playwright (the child process inherits them), or set
`E2E_SKIP_STACK_RESET=1` and reset the throttle manually.

## M3 AI capture

### 2026-10-13 infra (host macOS, Docker via OrbStack)

Isolated prod-like stack: `COMPOSE_PROJECT_NAME` scratch name, `COMPOSE_FILE=compose.yaml:compose.prod.yaml`,
`APP_IMAGE=personal-finance:local`, `HTTPS_PORT=18743`.

| Check | Command | Result |
|---|---|---|
| Runtime image | `docker build --target runtime -t personal-finance:local .` | success; `storage/app/private/receipts` created as `app` (uid 1000) in the image |
| Compose config | `docker compose config -q` (dev and prod) | valid |
| Stack up | `docker compose up -d --wait` | `migrate` exited 0; `db`, `web` healthy; `worker`, `scheduler` running |
| Runtime smoke | `make smoke` / `scripts/smoke.sh` (also in CI `e2e`) | `/up` 2xx; `pg_isready` ok; effective ini `upload_max_filesize`/`post_max_size` 12M, `max_execution_time` 45; receipts dir exists, writable and owned by the runtime uid in `web`, `worker`, `scheduler`; a file written by `web` is readable and deletable by `scheduler`; `schedule:list` shows `30 3 * * * php artisan app:drafts:purge` |
| Entrypoint guard | root-owned `appstorage` volume | container exits 1 with an `app-entrypoint: ... not writable` message |
| Upgrade path | volume from an older image without `private/receipts` | entrypoint creates it as `app`, exit 0 |
| Lint | `check-pins.sh`, `actionlint` 1.7.12, `shellcheck` 0.11.0 | clean |

Teardown: `down -v`; no containers or volumes of the scratch project remain.

## M5 Reports and dashboard

### 2026-10-14 01:11 CEST perf (Darwin arm64, PHP 8.5.8, PostgreSQL 18.6)

Generated by `make perf` (`scripts/perf.sh`) at commit `e0c9a03+dirty`.

| Check | Command | Result |
|---|---|---|
| Scratch seed | `php artisan db:seed --class=PerformanceSeeder` on `finance_perf` | pass; 50000 live movements in 5425 ms |
| Ledger invariants | `php artisan app:ledger:verify` on `finance_perf` | pass; Ledger OK: no invariant violations found. |
| Perf group | `php artisan test --group=perf` on `finance_test` | pass; Tests: 2 passed (422 assertions) |

| Endpoint | month_start_day | p50 ms | p95 ms | p95 < 300 ms |
|---|---|---|---|---|
| summary | 1 | 3 | 4 | pass |
| trend | 1 | 4 | 4 | pass |
| trend by category | 1 | 9 | 11 | pass |
| net worth | 1 | 13 | 17 | pass |
| capture metrics | 1 | 4 | 5 | pass |
| summary | 25 | 3 | 6 | pass |
| trend | 25 | 4 | 6 | pass |
| trend by category | 25 | 10 | 12 | pass |
| net worth | 25 | 15 | 17 | pass |
| capture metrics | 25 | 4 | 5 | pass |

### 2026-10-14 QA gate and journeys (host macOS, Docker 29.4.0 via OrbStack, Compose v5.1.2)

Isolated prod-like stack at commit `e0c9a03+dirty`: `COMPOSE_PROJECT_NAME=pf-m5-qa`,
`COMPOSE_FILE=compose.yaml:compose.prod.yaml`, `COMPOSE_ENV_FILES` pointing at a scratch env file built
from `.env.example` with a fresh `APP_KEY`, `DB_PASSWORD=finance`, `APP_IMAGE=personal-finance:local`,
`HTTP_PORT=18680`, `HTTPS_PORT=18843` and `SANCTUM_STATEFUL_DOMAINS=localhost,localhost:18843`
(host ports 80/443 are taken by another project). The same three `COMPOSE_*` variables were exported in
the shell that ran Playwright so `global-setup.ts` resets the login throttle on this stack.

| Check | Command | Result |
|---|---|---|
| Runtime image | `docker build --target runtime -t personal-finance:local .` from the current tree | success; Angular build includes the M5 report pages |
| Compose config | `docker compose config -q` | valid |
| Stack up | `docker compose up -d --wait` | `migrate` exited 0; `db`, `web` healthy; `worker`, `scheduler` running |
| Single user | `printf ... \| docker compose exec -T web php artisan app:create-user e2e@example.com --password-stdin` | created |
| Dev seed | `docker compose exec -T web php artisan db:seed --class=DevSeeder --force` | seeded |
| Ledger invariants | `docker compose exec -T web php artisan app:ledger:verify` | `Ledger OK`, exit 0 |
| Runtime smoke | `E2E_BASE_URL=https://localhost:18843 scripts/smoke.sh` | all checks passed |
| Playwright M0-M5 | `E2E_BASE_URL=https://localhost:18843 npx playwright test` | 51/51 passed in 1.5 min (setup + `m0-auth` 4, `m1-ledger` 4, `m2-movements` 7, `m3-capture` 3, `m4-recurring` 3, `m5-reports` 4, each on Chromium and WebKit) |
| Playwright M0-M5 after the net-worth label fix | image rebuilt, `docker compose up -d --wait`, same command | 51/51 passed in 1.4 min; `m5-reports` now also asserts the assets tile and the `Deudas` liabilities tile against `/api/v1/reports/net-worth` |
| Frontend lint | `npm run lint`, `npx prettier --check .` | all files pass; Prettier clean |
| Frontend tests | `npm test` | Vitest 62 files, 432 passed |
| Frontend build | `npx ng build` | success |

Teardown: `docker compose down -v` on `pf-m5-qa`; no containers or volumes of the scratch project remain.

## M8 Operations hardening and release (infra)

### 2026-10-14 04:05-04:32 CEST infra validation (host macOS arm64, Docker 29.4.0 via OrbStack, Compose v5.1.2)

Images built from the working tree at `3d80efd+dirty`: `docker build --target runtime -t personal-finance:m8 .`
and `docker build -t personal-finance-backup:local docker/backup` (postgres 18.6-alpine, age v1.3.2,
rclone v1.75.2, supercronic v0.2.49, all sha256-verified at build time). Prod-like scratch project
`pf-m8-infra` (`compose.yaml` + `compose.prod.yaml` + an overlay binding a host directory as the
off-site remote), `HTTP_PORT=18680`, `HTTPS_PORT=18843` (host 80/443 are taken by another project).

| Check | Command | Result |
|---|---|---|
| Compose config | `make config` (dev and prod, AI env reach) | valid; prod requires `APP_IMAGE`, `BACKUP_AGE_RECIPIENT`, `BACKUP_REMOTE` |
| Stack up | `docker compose up -d --wait` | `migrate` exited 0; `db`, `web`, `backup` healthy; `worker`, `scheduler` running |
| db port | `docker compose ps` / `config` | db shows only `5432/tcp` (not published) |
| HTTPS headers | `curl -skI https://localhost:18843/login` | `strict-transport-security: max-age=31536000; includeSubDomains`, CSP `default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, `x-content-type-options: nosniff`, `referrer-policy: same-origin`, `permissions-policy: camera=(self), microphone=(self)`, `x-frame-options: DENY`; same headers on `/up` (API) |
| HTTP redirect | `curl -sI http://localhost:18680/login` | `308` to `https://localhost/login` |
| Backup run | `docker compose exec backup backup-run` | three `age` files (`db.dump`, `storage.tar.gz`, `manifest.txt`) locally (0600) and on the remote; heartbeat written |
| Unreadable without key | `pg_restore -l`, `tar -tz` on the ciphertext; `age -d` with another identity; grep of a seeded email | `not a valid archive`, `invalid magic`, `no identity matched any of the recipients`, no plaintext match; no `AGE-SECRET-KEY` in the backup container env |
| Retention | files dated 2026-09-01 and 2026-10-01 locally and remotely, then `backup-run` | 2026-09-01 pruned in both places; 2026-10-01 (13 days) kept |
| Stale healthcheck | heartbeat set to now - 27 h | `backup-healthcheck` exit 1 (`stale: ... 27 h ago (limit 26 h)`); a probe container with a 2 s interval reported Docker health `unhealthy` |
| Rate limits | curl with Sanctum CSRF flow | 5 x 422 then `429` on the 6th bad login; 10 x 422 from one IP with distinct emails then `403 {"code":"ip_blocked"}`, also for the correct password; 120 x 200 then `429` on `/api/v1/accounts`; logs show `auth.failed` and `auth.lockout` |
| Deploy from a pulled tag | images pushed to a throwaway local `registry:3.0.0`, local copies removed, `ENV_FILE=... COMPOSE_PROJECT_NAME=pf-m8-deploy DEPLOY_SMOKE_URL=https://localhost:18843/up DEPLOY_SMOKE_INSECURE=1 scripts/deploy.sh v0.8.0-rc.1` | pulled both images, pinned `APP_IMAGE`/`BACKUP_IMAGE` in the env file, `migrate` ran once (exit 0), `/up` ok, HSTS on the public URL, all services healthy |
| Image secrets | `scripts/check-image-secrets.sh personal-finance:m8 personal-finance-backup:local` | first run FAILED: the local PHPStan container cache under `backend/storage/framework/cache/phpstan` (gitignored, not dockerignored) held an OpenAI-style key captured from the developer environment and was baked into the runtime image. Fixed by excluding `backend/storage/framework/cache/*` and `backend/storage/*.key` in `.dockerignore`; rebuilt image passes. A probe image with a baked `ENV`, a sensitive `ARG` and `/app/.env` fails with 6 findings |
| Playwright M0-M8 with production headers | `E2E_EXPECT_SECURITY_HEADERS=1 npx playwright test` against `pf-m8-infra` | with the stock 120/min API limit: the M8 hardening specs (headers, no CSP violations on every signed-in page) passed, but 52 M0-M7 journeys failed with HTTP 429 from the API throttle (226 x 429 in the web log); with the limit raised to 100000 inside the scratch container only (no source change): 111/111 passed in 2.6 min. See open issue below |
| Lint | `actionlint` 1.7.12 (Docker), `shellcheck` 0.11.0 `-S warning` on `scripts/*.sh` and `docker/backup/*.sh`, `scripts/check-pins.sh` | clean |

Open issue for the QA gate: the parallel Playwright suite shares one user and exceeds the new
120 requests/minute API limit, so the CI `e2e` job will fail until the limit is configurable for
the e2e stack (for example an env-backed `finance.security.api_rate_limit_per_minute` set high in
the CI compose env) or the suite is throttled.

Teardown: every scratch project (`pf-m8-infra`, `pf-m8-deploy`, `pf-drill-source`, `pf-restore-drill`)
removed with `down -v`; the registry container and its pushed tags removed.

### 2026-10-14 04:31 CEST restore drill

`APP_IMAGE=personal-finance:m8 BACKUP_IMAGE=personal-finance-backup:local scripts/restore-drill.sh`
(the same script `.github/workflows/restore-drill.yml` runs monthly). Total 30 s.

| Step | Result |
|---|---|
| Source stack `pf-drill-source` (prod overlay) | user with default categories, `DevSeeder`, one 4 KiB receipt linked to a movement; `app:ledger:verify` ok |
| Backup with a throwaway key pair | `pf-20261014T043127` uploaded as three age files; unreadable by `pg_restore` and by another identity |
| Retention and staleness | 2000-01-01 copies pruned locally and remotely, fresh kept; healthcheck fails at 27 h |
| `scripts/restore.sh` (newest backup `pf-20261014T043128`) into `pf-restore-drill` | sha256 of both archives match the manifest; `pg_restore` ok; 19 tables, row counts identical (accounts 4, categories 29, transactions 23, transfers 2, attachments 1, settings 1, users 1, migrations 21, others 0); 2 storage files; 1 receipt matches `attachments.sha256`; `migrate` nothing to migrate; `app:ledger:verify` "Ledger OK"; restore took 12 s |
| Teardown | both scratch projects and the decrypted files removed |

Earlier manual run at 04:09 restoring `pf-20261014T040844` gave the same counts; negative runs
failed as expected (wrong identity: "cannot decrypt the manifest"; one byte appended to the dump:
"sha256 mismatch").

Save latency and capture `extraction_ms` p95 for the M8 gate: save p95 is recorded in the perf
entry below (30 quick-add saves on 10k movements, p95 11 ms, budget 1 s at the product level and
300 ms in the test). The production restore drill from the real off-site remote is pending until
the server exists (manual).

### 2026-10-14 04:53 CEST perf (Darwin arm64, PHP 8.5.8, PostgreSQL 18.6)

Generated by `make perf` (`scripts/perf.sh`) at commit `3d80efd+dirty`.

| Check | Command | Result |
|---|---|---|
| Scratch seed | `php artisan db:seed --class=PerformanceSeeder` on `finance_perf` | pass; 50000 live movements in 6224 ms |
| Ledger invariants | `php artisan app:ledger:verify` on `finance_perf` | pass; Ledger OK: no invariant violations found. |
| Perf group | `php artisan test --group=perf` on `finance_test` | pass; Tests: 5 passed (553 assertions) |

| Endpoint | month_start_day | p50 ms | p95 ms | p95 < 300 ms |
|---|---|---|---|---|
| save (POST /transactions) | - | 9 | 11 | pass |
| summary | 1 | 5 | 9 | pass |
| trend | 1 | 17 | 20 | pass |
| trend by category | 1 | 32 | 35 | pass |
| net worth | 1 | 19 | 22 | pass |
| capture metrics | 1 | 7 | 9 | pass |
| budget vs actual | 1 | 9 | 11 | pass |
| summary | 25 | 4 | 8 | pass |
| trend | 25 | 20 | 22 | pass |
| trend by category | 25 | 32 | 34 | pass |
| net worth | 25 | 19 | 21 | pass |
| capture metrics | 25 | 7 | 9 | pass |
| budget vs actual | 25 | 5 | 9 | pass |

A first run of this entry failed with HTTP 429 on the reports group because the new 120/min API
limit applied to the 40-sample loops; `ReportsPerformanceTest` now raises
`finance.security.api_rate_limit_per_minute` inside the test only.

Capture `extraction_ms` p95: not measured. No real-provider run was possible in this gate (no
`OPENAI_API_KEY` and no anonymized samples in `tests/Fixtures/ai-eval`), and test runs use AI fakes
whose timings are meaningless, so no value is recorded. The measurement is defined and listed under
"Pending manual items": `php artisan app:ai-eval tests/Fixtures/ai-eval` now prints p95 of the same
total that is stored as `captures.extraction_ms`, and `make capture-latency` runs
`percentile_cont(0.95) WITHIN GROUP (ORDER BY extraction_ms)` per capture kind over the production
`captures` table (checked against the dev database: valid SQL, 0 rows).

Gate summary: save p95 < 1 s is met. The capture `extraction_ms` p95 half of the criterion is
formally deferred, see `milestones/M8.md`, "Deferrals".

### 2026-10-14 05:10-05:20 CEST M8 fixes: API limit env and single-snapshot backups

Images: `docker build --target runtime -t personal-finance:m8fix .` and
`docker build -t personal-finance-backup:local docker/backup` from the working tree.

| Check | Command | Result |
|---|---|---|
| API limit reaches the containers | `make config` (dev and prod) with `scripts/check-compose-env.sh` now requiring `API_RATE_LIMIT_PER_MINUTE` and `LOGIN_LOCKOUT_CACHE_STORE` | `compose-env: ok 18 AI and security variables reach web worker scheduler`; an empty `API_RATE_LIMIT_PER_MINUTE` renders as `120` |
| Limit fallback | `php artisan test tests/Feature/Security/ApiRateLimitTest.php` | 12 passed; `''`, `'0'`, `0`, `-5` and `'unlimited'` all fall back to 120/min |
| Playwright M0-M8 with production headers | scratch project `pf-m8-fix` (`compose.yaml` + `compose.prod.yaml`, `HTTPS_PORT=18843`, `API_RATE_LIMIT_PER_MINUTE=100000` as in CI and `make e2e-stack`), `E2E_EXPECT_SECURITY_HEADERS=1 npx playwright test` | 111/111 passed in 2.6 min; 0 x 429 in the web log; the open issue from 04:05 is closed |
| Backup on the post-journey stack | `docker compose exec backup backup-run` | row counts, `pg_dump --snapshot` and the receipt list come from one exported REPEATABLE READ snapshot; `storage_files` is counted from the archived tar stream; no scratch files left in `/backups` |
| Backup refuses an inconsistent archive | attachment row pointing to a missing receipt, then `backup-run` | `ERROR 1 receipt(s) referenced by the database dump are missing from the storage archive`; no `.partial` files kept |
| Restore drill | `make restore-drill` | passed in 32 s; 19 tables match the manifest, 2 storage files, 1 receipt matches its sha256, `app:ledger:verify` Ledger OK |
| Lint | `shellcheck` 0.11.0 (Docker) on `docker/backup/backup-run.sh` and `scripts/check-compose-env.sh`; `pint`, `phpstan` | clean |

Teardown: `pf-m8-fix`, `pf-drill-source` and `pf-restore-drill` removed with `down -v`.

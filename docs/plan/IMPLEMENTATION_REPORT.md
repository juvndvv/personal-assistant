# Implementation report

Branch `feat/finance-app`, 2026-10-14. Sources of truth: `docs/product/PRD – App personal de finanzas.md`,
`docs/product/TRD-app-finanzas.md`, and the plan documents in this folder (`IMPLEMENTATION_PLAN.md`,
`DECISIONS.md`, `DATA_MODEL.md`, `API_CONTRACT.md`, `QA_LOG.md`, `milestones/`).

## 1. Summary

Every functional requirement from P0 to P2 (RF-01 to RF-50) is implemented. Each milestone went through
plan, implement, review and QA cycles (3 cycles per milestone) and closed with its QA gate green. A final
full-stack QA run on a scratch compose project passed every gate and every acceptance journey.

The user decisions below override the open questions in the PRD and TRD. All of them are implemented:

| Decision | Outcome |
|---|---|
| Scope P0 + P1 + P2, budgets included | Done (M1-M7) |
| AI option A (OpenAI only) through `laravel/ai`, provider-agnostic code | Done. Provider and model are set only in `config/ai.php` and `.env`. An arch test rejects model literals in `app/` |
| Configurable `month_start_day` (1-28) | Done. `PeriodResolver` drives reports, budgets, savings rate, forecast and list filters |
| Variable recurring templates create a draft that asks for the amount | Done (`OccurrenceEligibility::AwaitingAmount`) |
| Free-form tags (many-to-many), filterable, exported in CSV | Done |
| Receipts kept on confirmed movements; only discarded or orphaned drafts are cleaned up | Done (`DiscardDraft`, `app:drafts:purge`, receipts gallery) |

Final gates: `check-pins`, Pint and PHPStan level 9 pass. Pest passes 1181 tests (6655 assertions) on
PostgreSQL. ESLint, Prettier and Vitest pass (74 files, 521 tests). The production Angular build and the
ngsw/manifest checks pass. Dev and prod compose configs are valid. The latest Playwright run
(M0-M8 journeys) passed 111/111 with production security headers (`QA_LOG.md`, M8).

## 2. Milestones

| Id | Title | Cycles | QA | Commit |
|---|---|---|---|---|
| M0 | Foundation: monorepo, Docker, CI, auth, PWA shell, yukit-web gate | 3 | passed | `ec9579d` |
| M1 | Ledger kernel: accounts, categories, adjustments, balances, settings, periods | 3 | passed | `8c914b6` |
| M2 | Movements: quick add, transfers, card settlement, list, search, filters, tags | 3 | passed | `cdc1422` |
| M3 | AI capture by voice and photo: drafts, receipts, cleanup | 3 | passed | `b656630` |
| M4 | Recurring: templates, idempotent generation, variable drafts, forecast | 3 | passed | `e0c9a03` |
| M5 | Reports and dashboard: by category, 12-period trend, savings rate, net worth, usage metrics | 3 | passed | `eefdfed` |
| M6 | Budgets and budget vs actual | 3 | passed | `76eb063` |
| M7 | Learned suggestions and full CSV export | 3 | passed | `3d80efd` |
| M8 | Operations hardening and release | 3 | passed | `64a6fa9` |
| Final | Completeness gaps and final QA fixes | - | passed | `5646fdf` |

Milestone outcomes:

- **M0**: Laravel 13 + Angular 22 monorepo. FrankenPHP serves the API and SPA on the same domain over
  HTTPS. Sanctum SPA cookie auth, single user created by `app:create-user`, PWA shell, CI pipeline.
  yukit-web 0.3.4 is pinned with scoped overrides (its peer is `@angular/core ^21`, see ADR-026/026a)
  and wrapped in `shared/ui`.
- **M1**: four account types, a two-level category tree split by kind, dated balance adjustments,
  balances computed (never stored), settings (`month_start_day`, default account), period resolver,
  `app:ledger:verify`.
- **M2**: quick add in 3 taps with defaults, two-leg transfers, card settlement with a suggested
  statement amount, movement list with search, filters and tags, soft delete and restore.
- **M3**: voice (STT, then structured extraction) and photo capture into a separate drafts table.
  Nothing is saved without confirmation. Low-confidence fields are highlighted. Receipts are kept,
  and the system degrades to manual entry when AI fails.
- **M4**: monthly, quarterly and yearly templates. A 06:00 Europe/Madrid generator that is idempotent
  (`UNIQUE(template_id, slot_month)`) and catches up missed slots. Variable templates create drafts.
  Forecast of the current period.
- **M5**: category summary, 12-period trend, savings rate in basis points, net worth with per-account
  last update and stale flag, capture usage metrics. Report endpoints p95 < 300 ms on a 50k-movement
  seed.
- **M6**: versioned monthly budgets per top-level expense category (a budget repeats until changed),
  budget-vs-actual report, clearing a budget and its history.
- **M7**: category and account suggestions learned from corrections (exact match, then trigram).
  Movements CSV (BOM, `;`, cents and euros, tags) and a full zip archive with optional receipts.
- **M8**: encrypted daily backups (pg_dump + storage, `age`, `rclone` off-site, 30-day retention,
  heartbeat healthcheck), restore and restore drill (monthly in CI), IP lockout and rate limits,
  session hardening, immutable tagged release images, `scripts/deploy.sh`.

## 3. Requirement traceability

### Functional requirements (PRD)

| RF | Priority | Status | Evidence |
|---|---|---|---|
| RF-01 Accounts, 4 types | P0 | done | `Actions/Accounts/*`, `AccountsApiTest`, `AccountsConstraintsTest`, e2e m1 |
| RF-02 Manual entry in ≤ 3 taps | P0 | done | `QuickAddDefaults`, `QuickAddDefaultsTest`, e2e `m2-movements.spec.ts` asserts 3 clicks |
| RF-03 Transfers | P0 | done | `RegisterTransfer` + deferred leg trigger, `TransfersApiTest`, `LedgerInvariantsTest` |
| RF-04 Card settlement with suggested amount | P0 | done | `SuggestCardSettlement`, `SettleCreditCard`, `CardSettlementTest`, `StatementWindowTest` |
| RF-05 Dated balance adjustment | P0 | done | `RecordBalanceAdjustment`, `RecordBalanceAdjustmentTest` |
| RF-06 Categories and subcategories | P0 | done | `Actions/Categories/*`, depth trigger, `CategoriesConstraintsTest` |
| RF-07 List with search, filters, edit | P0 | done | `ListTransactionsRequest`, `TransactionsListTest`, `transaction-filters.spec.ts`, e2e m2 |
| RF-10 Voice capture | P0 | done | `CaptureProcessor`, `voice-recorder.ts`, `CaptureApiTest` (faked), e2e m3 |
| RF-11 Photo capture | P0 | done | `CaptureProcessor`, `image-compressor.ts`, e2e m3 |
| RF-12 Confirm before save, low confidence highlighted | P0 | done | drafts table, `ConfirmDraft`, threshold 0.7, `DraftsApiTest`, `draft-review.page.spec.ts` |
| RF-13 Learned category/account suggestions | P1 | done | `LearnCategorization`, `SuggestCategorization`, `LearnedCategorizationTest`, e2e m7 |
| RF-20 Recurring templates | P0 | done | `RecurringTemplate`, `RecurrenceScheduleTest`, `RecurringTemplatesApiTest` |
| RF-21 Automatic generation, origin "fijo" | P0 | done | `GenerateRecurringTransactions`, `GenerateRecurringTransactionsTest`, e2e m4 |
| RF-22 Forecast of pending recurring | P1 | done | `RecurringForecast`, `RecurringForecastTest`, `forecast-card.spec.ts` |
| RF-30 Spend by category, 12-period trend | P1 | done | `PeriodSummaryReport`, `TrendReport` (raw SQL cross-check), e2e m5 |
| RF-31 Savings rate | P1 | done | `BasisPoints`, `PeriodSummaryReportTest` |
| RF-32 Net worth with last update | P1 | done | `NetWorthReport`, `NetWorthReportTest` |
| RF-33 Budget vs actual | P2 | done | `BudgetVsActualReport`, `BudgetVsActualReportTest`, e2e m6 |
| RF-40 Monthly budget per category | P2 | done | `SetBudget` (versioned), `BudgetsApiTest`, e2e m6 |
| RF-50 Full CSV export | P1 | done | `ExportTransactionsCsv` (with tags), `ExportFullArchive`, e2e m7 |

Domain rules from the PRD (computed opening balance, transfers neutral for reports and net worth,
deferred card expense counted once, adjustments outside reports but in net worth, recurring confirmed
automatically, separate income and expense categories, budgets repeat until changed, integer cents):
all **done** and covered by tests (`BalanceCalculatorTest`, `PeriodSummaryReportTest`,
`NetWorthReportTest`, `CardSettlementTest`, `GenerateRecurringTransactionsTest`,
`CategoriesConstraintsTest`, `BudgetsApiTest`, CSV round-trip e2e m7).

### Non-functional requirements

| NFR | Status | Notes |
|---|---|---|
| Extraction < 5 s | partial | Deadline 15 s server, 25 s client. The p95 against the real provider is not measured yet and is formally deferred in `milestones/M8.md`. `app:ai-eval` and `make capture-latency` are ready |
| Save < 1 s | done | p95 11 ms (`QuickAddPerformanceTest`, QA_LOG M8) |
| HTTPS everywhere | partial | HSTS, 308 redirect and Secure cookies are verified in CI. Real iPhone/Android HTTPS and PWA install are still pending manual items |
| Single user | done | `app:create-user` refuses a second user, no register route |
| Daily backups | partial | Service, encryption, retention, healthcheck and the local restore drill are verified. A restore from the real off-site remote is still pending |
| Europe/Madrid | done | app, DB, compose TZ, schedules, frontend date helpers |

### TRD

All TRD items audited (stack versions with exact pins, single image with multi-stage build, compose
dev/prod split, healthchecks, migrations on deploy, Postgres integrity, Sanctum SPA, scheduled jobs, AI
flow and schema, fakes with `preventStray*`, eval set, PWA without API caching, iOS audio, photo resize,
local HTTPS, security, logs to stderr, quality gates, CI and release) are **done**. The one partial item,
TRD 6.2 server validation (future dates for scheduled transfers were clamped to today), was closed in
`5646fdf`. A transfer date up to 366 days ahead is now kept and flagged.

## 4. Review findings

Every finding left open at the end of the M0-M8 cycles was checked against the final tree. All of them
are resolved:

| Milestone | Finding | Resolution |
|---|---|---|
| M0 | No throttle on `PUT /auth/password` | `throttle:password` limiter (5/min per user+IP) |
| M0 | No multi-session password-change test | Test with `withCredentials()` and fresh guards and stores |
| M1 | Archived settlement account accepted, not cleared on archive | Rule rejects archived accounts; `ClearAccountReferences` nulls `settlement_account_id` |
| M1 | Type-change guard ignored soft-deleted movements | `transactions()->withTrashed()` |
| M1 | M1 checklist and QA_LOG entry missing | `milestones/M1.md`, QA_LOG M1 section |
| M2 | Transfer edit could downgrade a card settlement | `resolveKind()` waits for reference data and keeps the existing kind |
| M3 | `client_started_at` in UTC stored as Madrid wall time | Normalised with `setTimezone(app.timezone)` |
| M3 | No spec for transfer receipts on the out leg | Spec asserts the gallery uses `out_transaction_id` |
| M4 | Generator used a stale template snapshot | Template re-read with `lockForUpdate()` inside the slot transaction |
| M5 | M5 Playwright journeys never run | Run in QA_LOG M5, then M0-M8 111/111 in M8 |
| M5 | Out-of-range period labels caused 500 | Shared `App\Rules\PeriodLabel` in every period request |
| M5 | "Deudas de tarjetas" label also counted overdrawn accounts | Label renamed to "Deudas" |
| M5 | No raw SQL cross-check for trend | Added (start days 1 and 25, across a year boundary) |
| M6 | No UI to clear a budget | `BudgetsApi.clear()` and a confirmed action in the history sheet |
| M6 | `category_in_use` message listed budgets | Message fixed |
| M6 | Wrong constraint name in the reparent trigger | `categories_budgeted_top_level_only` |
| M6 | budget-vs-actual missing from the perf test | Added to the p95 endpoint map |
| M7 | Partial CSV leaked in the temp dir on failure | Path registered before the write |
| M7 | History-filled fields stayed after a later lookup found no hint | Previous values restored |
| M7 | Tags could contain the CSV separator `\|` | Rejected on movements and tag names |
| M8 | extraction p95 criterion not formally deferred | Deferral in `milestones/M8.md` |
| M8 | CI did not check stale heartbeat, pruning or decrypt without the key | All three are now in the CI backup step |
| M8 | Session Secure default not really tested | Test clears the env before loading the config |
| M8 | Retry-After value not asserted | Asserts `3600` and `60` with frozen time |
| M8 | `app:ai-eval` p95 output not asserted | Full output shape matched by regex |
| M8 | Hidden `visibilitychange` not specified | Spec added |
| Final QA | Caddy access logs printed `X-XSRF-TOKEN` | Log filter deletes the header in both Caddyfiles (`5646fdf`, validated with `frankenphp validate`) |
| Final QA | Image build failed when `APP_GID` already exists (macOS gid 20) | Existing group reused, numeric ownership (`5646fdf`, built with 501:20) |

### Still open

| Severity | Area | Finding | Why it is open / next action |
|---|---|---|---|
| minor | backend | `backend/app/Ai/CaptureProcessor.php`: with `OPENAI_API_KEY` empty, a capture still uploads the audio or image to the provider without credentials and shows "El proveedor de IA devolvió un error (HTTP 401)". The fallback to a manual draft works. | A naive credential check breaks the faked test suite (which runs with an empty key) and keyless providers (Ollama, Bedrock role auth). Add a provider credential check that treats faked providers and keyless drivers as configured, then a dedicated "La IA no está configurada" message and a test asserting no HTTP request is made. Low impact in practice: production always sets the key. |

## 5. Final QA

`passed: true`. Full stack on scratch project `pf-qa` (dev override, ports 18443/18080/15432), then
torn down with `down -v`.

- Gates: pins, Pint, PHPStan, Pest (1181), ESLint, Prettier, Vitest (521), production build with
  ngsw/manifest checks, image build, stack healthy, `curl` smoke (`/up` over HTTP/2, SPA deep link,
  401 without a session), prod compose config with `check-compose-env.sh` (18 variables).
- Acceptance journeys passed: single user, Sanctum cookie and CSRF login (419 without the token), four
  account types, category tree, expense/income/transfer with tags and `month_start_day=25`, card
  purchase and settlement with no double counting (hand-checked balances), balance adjustment and
  `Ledger OK`, recurring fixed + variable generator run three times (idempotent), capture with an
  unset provider degrading to a manual draft (receipt kept and downloadable, discard and purge
  clean up), reports with start day 25, budget vs actual, net worth today and at a past date, CSV
  and full zip export with tags and receipts.
- Not observed: the scheduled 06:00 recurring run (the stack was torn down before 06:00). The
  generator itself is covered by tests and manual runs.

## 6. Run locally

Prerequisites: Docker, Make; PHP 8.5, Composer and Node 24 on the host only for running linters and tests outside containers.

```bash
make env                                  # .env from .env.example with a fresh APP_KEY
make install                              # composer install + npm ci on the host (optional for docker-only use)
make up                                   # web, worker, scheduler, db, Angular dev server; waits until healthy
make user EMAIL=you@example.com NAME="You"
open https://localhost                    # or https://localhost:$HTTPS_PORT
```

- Keep the default `APP_UID`/`APP_GID` of 1000, or set them to your host ids (`id -u`, `id -g`). A
  macOS gid such as 20 now builds correctly.
- Ports already in use: set `HTTP_PORT`, `HTTPS_PORT`, `DB_HOST_PORT` in `.env` and add
  `localhost:<port>` to `SANCTUM_STATEFUL_DOMAINS`.
- Tests: `make lint`, `make test` (Pest on `finance_test`, needs `db`), `make e2e-stack` +
  `make e2e` (Playwright), `make perf`.
- AI in development: without `OPENAI_API_KEY` capture degrades to an empty draft and manual entry.
  Tests never call a real provider (fakes + `preventStray*`).

### HTTPS on the phone (`docs/ops/local-https.md`)

1. Add the hostnames the phone will use to `.env`: LAN IP, `.local` name, or (preferred) the Tailscale
   MagicDNS name. Put them in both `SERVER_NAME` and `SANCTUM_STATEFUL_DOMAINS` (with `:port` when not
   443), set `APP_URL`, then `docker compose up -d web`.
2. `make trust-ca` exports Caddy's local root CA to `.caddy/root.crt` and trusts it on macOS.
3. iOS: AirDrop the `.crt`, install the profile, then enable full trust in Settings > General >
   About > Certificate Trust Settings. Android: install it as a CA certificate in security
   settings.
4. Open `https://<hostname>`, log in, and install the PWA (Safari: Share > Add to Home Screen; Chrome:
   Install app). Microphone and camera need this secure context.
5. Do not run `docker compose down -v`: it deletes `caddy_data` and the CA, and every device must
   trust the new CA again.

## 7. Deploy to production (`docs/ops/deploy.md`)

1. Release: merge to `main` with CI green, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
   `release.yml` builds immutable images (`ghcr.io/<owner>/personal-finance:vX.Y.Z` and
   `personal-finance-backup:vX.Y.Z`), scans them for secrets and pushes them. Nothing is built on
   the server.
2. Host: clone the repo, check out the tag, run `cp .env.example .env && chmod 600 .env`, and log in
   to GHCR if the packages are private.
3. Fill in `.env`: `APP_KEY` (keep a copy in your password manager), `APP_URL`, `SERVER_NAME`,
   `SANCTUM_STATEFUL_DOMAINS`, `DB_PASSWORD`, `OPENAI_API_KEY` + `AI_*`, `BACKUP_AGE_RECIPIENT`
   (public key only), `BACKUP_REMOTE` plus `.env.backup` with the rclone credentials. Recommended
   access: Tailscale only with `CADDY_SERVER_EXTRA_DIRECTIVES=tls internal`, and trust the CA on
   every device. Alternative: a public hostname with Let's Encrypt (optionally behind an
   authenticating proxy, with `TRUSTED_PROXIES` set to its exact `/32`).
4. First run: `scripts/deploy.sh vX.Y.Z`. It pulls and pins the images, runs the one-shot `migrate`
   service, then `web`, `worker`, `scheduler` and `backup`, and checks `/up`. Then run
   `docker compose -f compose.yaml -f compose.prod.yaml exec web php artisan app:create-user you@example.com --name="You" --with-defaults`
   and `make backup-now`.
5. Upgrade: `git fetch --tags && git checkout vX.Y.Z && scripts/deploy.sh vX.Y.Z`. Rollback:
   `scripts/deploy.sh <previous tag>`. Migrations are not rolled back, so restore a backup if a
   destructive migration ran.

## 8. Switch AI provider (`docs/ops/ai-providers.md`)

Only `.env` changes. Then run `docker compose up -d` (or `php artisan config:cache`); code and
`compose.yaml` stay untouched.

- **A, OpenAI only (default)**: `OPENAI_API_KEY`, `AI_EXTRACTION_PROVIDER=openai`,
  `AI_TRANSCRIPTION_PROVIDER=openai`, optional `AI_EXTRACTION_MODEL` / `AI_TRANSCRIPTION_MODEL`
  (empty means the provider default).
- **B, mixed**: for example `AI_TRANSCRIPTION_PROVIDER=groq`, `AI_EXTRACTION_PROVIDER=anthropic`,
  `AI_FAILOVER=openai`, with each provider's key (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`, ...).
- **C, local**: `AI_*_PROVIDER=openai-compatible` with `OPENAI_COMPATIBLE_URL`,
  `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_TEXT_MODEL` (vision + JSON schema),
  `OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL`. Keep `AI_FAILOVER` empty so data never leaves the host.
- Shared settings: `AI_TIMEOUT` (12 s per call), `CAPTURE_DEADLINE_SECONDS` (15 s overall).
- After every switch, run `php artisan app:ai-eval tests/Fixtures/ai-eval` on the private sample set
  and log accuracy and latency in `QA_LOG.md`.

## 9. Backup and restore (`docs/ops/backup-restore.md`)

- **Backup**: the `backup` service runs every day at 03:00 Europe/Madrid (`BACKUP_SCHEDULE`). It
  streams `pg_dump` and a tar of the `appstorage` volume (receipts) directly into `age` encryption,
  writes an encrypted manifest (sha256 values, row counts, file count), uploads it with `rclone` to
  `BACKUP_REMOTE`, prunes copies older than 30 days locally and remotely, and writes a heartbeat. The
  healthcheck turns unhealthy after 26 h without a success. Run one on demand with `make backup-now`.
- **Keys**: generate the age key pair on your own computer. Only the `age1...` recipient goes on the
  server. Keep the private key in a password manager and on offline media.
- **Drill**: `scripts/restore.sh --identity key.agekey --source <remote> --app-image <image:tag>`
  restores the newest backup into a scratch project, verifies hashes, row counts, receipt hashes,
  `migrate --force` and `app:ledger:verify`, then deletes everything. `make restore-drill` runs a full
  cycle with throwaway keys, and `restore-drill.yml` runs it monthly in CI.
- **Disaster recovery**: on a new host with the same `APP_KEY`, run
  `scripts/restore.sh ... --project personal-finance --env-file .env`, then `scripts/deploy.sh <tag>`,
  then remove the private key from the host and run `make backup-now`.

## 10. Pending manual items and recommended next steps

Pending manual items (tracked in `QA_LOG.md`, "Pending manual items"):

1. Trust the CA on a real iPhone and Android device and install the PWA. Test voice (iOS `audio/mp4`)
   and photo capture end to end.
2. First CI run on GitHub (all jobs green) and a first tagged release.
3. Run `app:ai-eval` with anonymized real samples and `OPENAI_API_KEY`. Record per-field accuracy and
   p50/p95 latency, then `make capture-latency` after real use. This closes the extraction < 5 s NFR.
4. Restore drill from the real off-site remote on the production setup.

Recommended next steps:

1. Close the open CaptureProcessor finding: skip the provider call when credentials are missing and
   show a clear "AI not configured" message.
2. Check monthly for a yukit-web release that supports Angular 22 and remove the scoped overrides
   (ADR-026a).
3. If extraction misses the 5 s target, try option B (fast STT such as Groq) using the eval set before
   changing anything else.
4. Watch the 06:00 recurring run and the 03:00 backup in production during the first week
   (`schedule:list`, `ps backup`).
5. Follow the monthly maintenance routine in `docs/ops/maintenance.md` (`composer outdated`,
   `npm outdated`, image tags), keeping every pin exact.

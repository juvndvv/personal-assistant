# Implementation plan: personal finance PWA

- Project: `/Users/yurest/Projects/Personal/personal-assistant`, branch `feat/finance-app`.
- Sources of truth: `docs/product/PRD – App personal de finanzas.md`, `docs/product/TRD-app-finanzas.md`, and this folder. Owner decisions in `DECISIONS.md` (ADR-001..006) override the PRD/TRD open questions.
- Companion files: `DECISIONS.md` (why), `DATA_MODEL.md` (schema), `API_CONTRACT.md` (HTTP), `QA_LOG.md` (created in M0; per-milestone QA results, manual device checks, performance numbers).

## 1. How this plan was built

Three drafts were judged against the PRD, the TRD and the owner decisions:

| Draft | Kept | Dropped |
|---|---|---|
| Domain-first (backbone) | DB-enforced invariants (composite FKs on category kind, deferred transfer-leg trigger, triggers for depth, opening date and writable accounts), signed ledger column, ledger contains only confirmed rows plus a separate `drafts` table, `recurring_occurrences` idempotency table, majority-month period labels, `app:ledger:verify`, property-style ledger test | Cursor pagination, a balance SQL view, soft-deleted categories |
| Risk-first | M0 spikes with evidence (yukit-web, Sanctum cookies, local HTTPS), single-origin dev topology through Caddy, one-shot `migrate` service, 419 retry interceptor, `quick-add/defaults` endpoint, budgets on top-level categories only, `unaccent` search, ULIDs for files, Playwright, risk register | Variable drafts stored inside `transactions`, AI before the ledger is complete |
| Vertical slice | Value-oriented milestone slices with a QA gate each, `Clock`-free "today" testing at 00:30 Madrid, CSV injection guard, enum-vs-CHECK consistency test, `ReportableTransactions` arch rule, transfer collapsing in the list | `transfer_out`/`transfer_in` types, null-amount drafts in the ledger |

Facts were re-verified on 2026-10-13 (see `DECISIONS.md` ADR-026 and ADR-027). Notably, `yukit-web@0.3.4` only conflicts with Angular 22 through its own `@angular/* ^21` peers; scoped npm `overrides` with literal versions resolve the tree (probe install done).

## 2. Repository layout (target)

```
backend/                     Laravel 13 (PHP 8.5)
  app/Actions/<Area>/        one use case per class (handle())
  app/Ai/                    Agents/TransactionExtractor, CaptureProcessor, SanitizeExtraction (only place importing Laravel\Ai)
  app/Domain/                Period, PeriodResolver, BalanceCalculator, RecurrenceSchedule, HintKey
  app/Enums/                 string-backed enums mirrored by CHECKs
  app/Reports/               read-side report queries
  app/Http/{Controllers,Requests,Resources}/Api/V1/
  app/Console/Commands/      CreateUser, VerifyLedger, GenerateRecurring, PurgeDrafts, AiEval
  database/migrations, database/seeders
  tests/{Arch,Database,Feature,Unit,Fixtures}
frontend/                    Angular 22 PWA
  src/app/core/{api,auth,http,money,date}
  src/app/shared/{ui,charts}
  src/app/features/{auth,shell,home,accounts,categories,settings,transactions,transfers,capture,drafts,recurring,reports,budgets,export,dev}
  e2e/                       Playwright specs (one journey per milestone)
docker/frankenphp/{Caddyfile,Caddyfile.dev,php.ini}  docker/db/init/  docker/backup/
compose.yaml  compose.override.yaml  compose.prod.yaml  Dockerfile  .env.example  Makefile
scripts/{check-pins.sh,deploy.sh,restore.sh}
.github/workflows/{ci.yml,release.yml,restore-drill.yml}
docs/plan/*  docs/ops/*
```

## 3. Delivery workflow per milestone (for the orchestrator)

Every milestone runs the same cycle. Milestones are strictly sequential.

1. **Plan.** The planner expands the milestone below into a checklist in `docs/plan/milestones/Mx.md` (files, migrations, tests to write first). It verifies the checklist against `DATA_MODEL.md` and `API_CONTRACT.md`. Any contract change is made in those files first.
2. **Contract freeze.** Migrations and the contract section for the milestone are fixed before parallel work starts.
3. **Implement** (parallel agents):
   - backend-domain: migrations, enums, models, Domain, Actions, DB constraint tests, Action tests;
   - backend-http: Form Requests, Resources, Controllers, routes, feature tests;
   - frontend: API clients, features, `shared/ui` wrappers, Vitest specs, Playwright journey;
   - infra (M0, M8 and when needed): Docker, compose, CI, ops scripts and docs.
   The backend-domain agent lands migrations first; the HTTP and frontend agents build on the frozen contract.
4. **Review.** A reviewer checks the diff against: the invariants in `DATA_MODEL.md`; the conventions (integer cents, `date` type, Europe/Madrid, no explanatory comments, inclusive terms, English code and Spanish UI copy, no provider/model literals, mocks only in tests, AI fakes and `preventStray*`); contract conformance (request, response, error codes); wrappers used on critical screens. Findings go back to the implementers. Maximum 3 review loops.
5. **QA gate.** All must pass:
   - `make lint` → `vendor/bin/pint --test`, `vendor/bin/phpstan analyse` (level 9), `npm run lint`, `npx prettier --check .`, `scripts/check-pins.sh`
   - `make test` → `php artisan test --parallel` (Pest, PostgreSQL `finance_test`) and `npm test` (Vitest, run mode)
   - `make build` → `npx ng build` and `docker build --target runtime .`
   - `docker compose up -d --wait` smoke: `/up` 200, login works, `php artisan app:ledger:verify` passes on the dev seed (from M1)
   - `make e2e` → Playwright journeys of this and all previous milestones against the compose stack
   - every acceptance criterion of the milestone checked off in `docs/plan/milestones/Mx.md`, results appended to `QA_LOG.md`
   A failure goes back to Implement.
6. **Commit.** The orchestrator commits with a Conventional Commit (subject given per milestone). Implementers never run `git commit`.

Manual real-device checks (iPhone microphone and camera over local HTTPS, end-to-end capture timing) are listed in `QA_LOG.md` as pending manual items. They never block the automated gate.

## 4. Milestones

Legend: **BE** backend, **FE** frontend, **IN** infra. Each milestone leaves `docker compose up` working and every test green.

---

### M0: Foundation (monorepo, Docker, CI, auth, PWA shell, yukit-web gate)

**Goal.** A user logs in over HTTPS on an installable PWA shell; CI runs lint, tests, build and e2e; all risky unknowns (yukit-web on Angular 22, Sanctum cookies, local HTTPS) are settled with evidence.

**IN**
1. Root files: `README.md` (quickstart), `.editorconfig`, `.gitignore` (`.env`, `node_modules`, `vendor`, `storage`, AI eval samples), `.env.example` (compose-level: `APP_IMAGE`, `SERVER_NAME`, `DB_*`), `Makefile` (`up`, `down`, `logs`, `lint`, `test`, `test-backend`, `test-frontend`, `build`, `e2e`, `user`, `trust-ca`, `verify-ledger`), `scripts/check-pins.sh`.
2. `Dockerfile` (ADR-029): stages `frontend-build` (`node:24.21.0-alpine`), `vendor` (`composer:2.10.3`), `runtime` (`dunglas/frankenphp:1.13.0-php8.5.11-alpine`, `install-php-extensions pdo_pgsql intl zip bcmath opcache pcntl`, non-root user, Angular `dist/frontend/browser` → `backend/public/app`), `dev` (Xdebug, dev deps).
3. `docker/frankenphp/Caddyfile` (prod routing, SPA fallback, no-cache on `index.html`/`ngsw.json`), `Caddyfile.dev` (API to Laravel, rest `reverse_proxy frontend:4200`, `tls internal`), `php.ini` (upload 12M, `max_execution_time` 45, opcache), `docker/db/init/01-test-db.sql` (creates `finance_test`).
4. `compose.yaml`, `compose.override.yaml`, `compose.prod.yaml` exactly as ADR-029 (prod has the `migrate` one-shot service; backup arrives in M8).
5. `.github/workflows/ci.yml`, on every push and PR, actions pinned to exact tags:
   - `pins`: `scripts/check-pins.sh`;
   - `backend`: PHP 8.5 (`shivammathur/setup-php`), `postgres:18.6-alpine` service, `composer install`, Pint `--test`, PHPStan, `php artisan test --parallel`;
   - `frontend`: Node 24.21.0, `npm ci`, ESLint, Prettier check, Vitest, `ng build`;
   - `image`: `docker buildx build --target runtime` with GHA cache, no push;
   - `e2e`: builds the image, starts `compose.yaml` + `compose.prod.yaml` with `APP_IMAGE` set to the local tag, creates the user with `--password-stdin`, runs Playwright (Chromium and WebKit).
6. `docs/ops/local-https.md` (trusting Caddy's local CA on iOS and Android, LAN/Tailscale hostnames). Create `docs/plan/QA_LOG.md`.

**BE**
1. `composer create-project laravel/laravel backend` (Laravel 13 skeleton, lock v13.36.0 or the newest 13.x at install). Require exact: `laravel/sanctum` 4.3.3, `laravel/ai` 1.2.1 (publish `config/ai.php`). Dev: `pestphp/pest` 5.3.x, `pestphp/pest-plugin-laravel` 5.0.x, `larastan/larastan` 3.13.x, `laravel/pint`. Remove PHPUnit-only scaffolding; `php artisan install:api`.
2. Config: `APP_TIMEZONE=Europe/Madrid`, `APP_LOCALE=es`, pgsql `timezone` `Europe/Madrid`, `SESSION_DRIVER/CACHE_STORE/QUEUE_CONNECTION=database`, `LOG_CHANNEL=stderr`, `SESSION_LIFETIME=43200`, `SESSION_SECURE_COOKIE=true`; `bootstrap/app.php` with `statefulApi()` and API prefix `api/v1`; `SANCTUM_STATEFUL_DOMAINS`/`SESSION_DOMAIN` from env. `backend/.env.example` with every key (including `OPENAI_API_KEY=` and `AI_*` placeholders).
3. Migration `create_postgres_extensions` (`pg_trgm`, `unaccent`, `f_unaccent`).
4. `app:create-user {email} {--name=} {--password-stdin} {--with-defaults}` (hidden prompt; refuses if a user exists; `--with-defaults` is wired in M1).
5. `AuthController` (`login`, `logout`, `me`, `password`), `LoginRequest`, `UpdatePasswordRequest`, `UserResource`; `RateLimiter::for('login')` (5/min, email + IP). No register route.
6. `App\Exceptions\DomainConflict` rendered as 409 `{message, code}`; JSON rendering for all API exceptions; `lang/es` (validation, auth, passwords).
7. Tooling: `phpstan.neon` (level 9, Larastan), `pint.json` (Laravel preset + `declare_strict_types`), composer scripts `lint`, `stan`, `test`. `phpunit.xml` uses pgsql `finance_test` (host from env, default `127.0.0.1`).
8. `tests/Pest.php`: `LazilyRefreshDatabase` for Feature/Database; global `beforeEach` with `Http::preventStrayRequests()` and `Transcription::fake()->preventStrayTranscriptions()`; global `afterEach` with `SET CONSTRAINTS ALL IMMEDIATE`.
9. Tests: `AuthTest` (login ok, wrong password 422, 6th attempt 429, `me` 401 as guest, logout invalidates session, remember sets the recaller cookie, register route 404), `CreateUserCommandTest`, `HealthTest`, `StrayGuardTest` (unfaked transcription throws), `tests/Arch` (strict types; no `dd/dump/ray/var_dump`; `Laravel\Ai` only in `App\Ai`; no `float` type declarations in `App\Actions`, `App\Domain`, `App\Reports`; controllers do not use `DB`; Mockery only in tests).

**FE**
1. `npx @angular/cli@22.2.2 new frontend --routing --style=css --ssr=false --skip-git` (check `ng new --help` for zoneless/standalone defaults), `ng add @angular/pwa@22.2.2`. `.npmrc` `save-exact=true`. ESLint (`angular-eslint`), Prettier, Vitest (confirm `ng test` uses Vitest), Playwright 1.64.0 with `playwright.config.ts` (`E2E_BASE_URL`, default `https://localhost`, `ignoreHTTPSErrors`).
2. `ngsw-config.json`: `assetGroups` only, no `dataGroups`, `navigationUrls` excluding `/api/**`, `/sanctum/**`, `/up`. Manifest (name "Finanzas", Spanish), icons.
3. **yukit-web gate** (ADR-026): load the `yurest-design` skill; re-check peers; install with scoped overrides and exact peers (Tailwind 4, `tw-animate-css`, `luxon`, `clsx`, spartan, ng-icons); import `yukit-web/theme.css`; dev-only `/dev/kitchen-sink` route (behind `environment.devTools`) rendering button, input, select, dialog, sheet, toast, tabs, table; Vitest render test; production build. Record the outcome as ADR-026a in `DECISIONS.md`.
4. `shared/ui` wrappers (ADR-026 list) with a consistent API (`variant`, `size`, `state: 'default' | 'warning' | 'error'`, `label`, `hint`). `ui-money-input` uses `inputmode="decimal"` and `parseEuroToCents`.
5. `core/http`: `provideHttpClient(withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }), withInterceptors([credentialsInterceptor, csrfRetryInterceptor, unauthorizedInterceptor]))`.
6. `core/auth`: signal `AuthStore` (`user`, `loadMe()`, `login()`, `logout()`), `authGuard`, `guestGuard`; `features/auth/login.page.ts` (email, password, "Recordarme" on by default; 422 and 429 messages).
7. `features/shell`: mobile bottom nav (Inicio, Movimientos, central "+" Capturar, Informes, Más) and desktop sidebar; placeholder pages; `LOCALE_ID 'es'`.
8. `core/money`: `parseEuroToCents` (string-based; accepts `12`, `12,5`, `12,50`, `12.50`, `1.234,56`; rejects negatives and > 2 decimals) and `eur` pipe (`formatCents`). `core/date`: `todayInMadrid()`, `formatDate` (es-ES), ISO helpers that never create timezone-shifted `Date`s.
9. `proxy.conf.json` (`/api`, `/sanctum`, `/up` → `https://localhost`, `secure: false`).
10. Tests: `parseEuroToCents` table, `eur` pipe, interceptors (419 retry once, 401 redirect), guards, login page; Playwright `e2e/m0-auth.spec.ts` (login, reload keeps session, logout).

**Acceptance criteria**
1. `docker compose up -d --wait` brings `web` and `db` to healthy; `https://localhost` shows the login page; `https://localhost/up` returns 200; editing a component hot-reloads through `web`.
2. `docker compose -f compose.yaml -f compose.prod.yaml config` is valid, publishes no db port, and contains the `migrate` service that app services depend on.
3. `php artisan app:create-user` creates the user and refuses a second one; login, `me` and logout work; the 6th failed login within a minute returns 429; `remember=true` sets the remember cookie; `/api/v1/auth/register` returns 404.
4. Pint, PHPStan level 9 and Pest pass; arch tests pass; an unfaked transcription call in a test throws.
5. ESLint, Prettier, Vitest and production `ng build` pass; generated `ngsw.json` contains no `/api` URL; the manifest is valid.
6. yukit-web gate outcome recorded as ADR-026a with evidence (`npm ls` output, build result, kitchen-sink test).
7. `scripts/check-pins.sh` passes; `ci.yml` defines the `pins`, `backend`, `frontend`, `image` and `e2e` jobs; `docker build --target runtime .` succeeds; the same image runs web, worker and scheduler.
8. Playwright `m0-auth` passes against the local stack.

---

### M1: Ledger kernel (accounts, categories, adjustments, balances, settings, periods)

**Goal.** The complete ledger schema with all DB invariants, configurable periods, accounts with live balances, categories, and balance adjustments.

**BE**
1. Migrations (raw SQL for CHECKs, generated columns, composite FKs and triggers; every `down()` works): `settings` (+ singleton row), `accounts`, `settings` FKs, `categories` (+ `categories_max_depth`), `transfers` (+ `transfers_card_settlement_accounts`), `transactions` (+ `transactions_date_after_opening`, `transactions_account_writable`, `transfer_legs_balanced` deferrable constraint triggers on `transactions` and `transfers`), `tags`, `tag_transaction`, all indexes in `DATA_MODEL.md` 3.2–3.7.
2. Enums: `AccountType`, `CategoryKind`, `TransactionType`, `TransactionOrigin`, `TransferKind`, `TransferLeg`; `EnumCheckConsistencyTest` reading `pg_constraint`.
3. Models: `Setting` (`Setting::current()`), `Account`, `Category`, `Transfer`, `Transaction` (scopes `reportable()`), `Tag`; `SoftDeletes` per `DATA_MODEL.md`; casts (`date` → `immutable_date`, cents → `int`, enums).
4. Domain: `Period` (readonly: `label`, `start`, `end`), `PeriodResolver` (ADR-003), `BalanceCalculator` (`forAccounts(?date)`, `forAccount(id, ?date)`, `lastMovementDates`, `lastAdjustmentDates`; one grouped query).
5. Actions: `Accounts\CreateAccount`, `UpdateAccount` (409 `opening_date_after_movements`; type locked once movements exist), `ArchiveAccount` (clears settings pointers), `UnarchiveAccount`, `DeleteAccount` (409 `account_has_movements`); `Categories\CreateCategory`, `UpdateCategory`, `ArchiveCategory`, `UnarchiveCategory`, `DeleteCategory` (409 `category_in_use`/`category_has_children`); `Ledger\RecordBalanceAdjustment`; `Settings\UpdateSettings`.
6. `DefaultCategoriesSeeder` (idempotent Spanish tree, expense: Vivienda (Alquiler/Hipoteca, Electricidad, Agua, Gas, Internet), Alimentación (Supermercado, Restaurantes, Cafeterías), Transporte (Combustible, Transporte público, Parking, Taxi), Salud, Ocio, Compras, Suscripciones, Educación, Viajes, Regalos, Impuestos y tasas, Otros; income: Nómina, Freelance, Intereses, Reembolsos, Otros ingresos); `app:create-user --with-defaults` runs it. `DevSeeder` (accounts of all 4 types, sample movements) for local QA.
7. `app:ledger:verify` (invariants 1–4 of `DATA_MODEL.md` §5).
8. HTTP (`API_CONTRACT.md` 3.3–3.5, minus settlement suggestion): `SettingsController`, `PeriodsController`, `AccountsController` (+ archive, unarchive, balance, adjustments), `CategoriesController`; requests and resources.
9. Tests: `tests/Database` one test per CHECK/FK/trigger (raw inserts expecting `QueryException`, including unbalanced transfer legs, expense with positive amount, income category on an expense, third category level, child with different kind, date before opening, insert on archived account, card settlement to a non-card); `PeriodResolverTest` (d ∈ {1, 2, 15, 16, 25, 28}; Feb, leap year, year rollover; label rule); `BalanceCalculatorTest`; action tests; feature tests for every endpoint and error code; `VerifyLedgerCommandTest` (passes on seed, fails on corrupted data inserted with triggers disabled).

**FE**
1. `core/api`: `settings.api.ts`, `periods.api.ts`, `accounts.api.ts`, `categories.api.ts`, DTOs in `models.ts`.
2. `features/accounts`: list grouped by type with balance (negative in red), last updated date and stale badge; create/edit form (card-only fields shown only for `credit_card`); archive/unarchive; delete with 409 → "archívala"; detail page with balance and "Ajustar saldo" sheet (target amount + date, shows the computed delta from the response).
3. `features/categories`: Gastos/Ingresos tabs, two-level tree, add subcategory, rename, icon and color, reorder, archive/unarchive, delete with 409 messages.
4. `features/settings` (under "Más"): `month_start_day` picker 1..28 with live preview from `GET /periods/current?month_start_day=`, default account, orphan-draft TTL.
5. Onboarding empty state on Inicio when there are no accounts (CTA to create the first one).
6. Tests: account form conditional fields and validation, category tree interactions, settings preview; Playwright `m1-ledger.spec.ts` (create the 4 account types, adjust a balance, change start day).

**Acceptance criteria (RF-01, RF-05, RF-06, ADR-003)**
1. All four account types can be created, edited, archived and unarchived; an account with movements cannot be deleted (409) but can be archived; archived accounts are hidden from pickers and still listed with `include_archived=1`.
2. Balance = opening balance + live movements up to today; an adjustment to a target balance yields exactly that balance at its date; a zero-delta adjustment is rejected with 422.
3. Raw SQL inserts violating each DB rule listed in BE-9 are rejected by PostgreSQL.
4. With `month_start_day = 25`, `GET /periods/current` on 2026-10-13 returns `{label: "2026-10", start: "2026-09-25", end: "2026-10-24"}`; with 1 it returns the calendar month.
5. Categories and subcategories are editable per kind; a child can never get the other kind.
6. `app:ledger:verify` passes on the dev seed and fails on deliberately corrupted data.
7. QA gate green, including the M0 and M1 Playwright journeys.

---

### M2: Movements (quick add, transfers, card settlement, list, search, filters, tags)

**Goal.** Record and manage every movement type; money moves between accounts without distorting income or expense; everything is searchable and editable.

**BE**
1. Actions: `Transactions\RegisterTransaction` (unsigned → signed; defaults date and account; tags; sets `last_used_account_id`; accepts an optional `draft_id` hook point used from M3), `UpdateTransaction` (expense↔income re-signs; adjustment rows recompute delta via `Ledger\UpdateBalanceAdjustment`; legs → 409), `DeleteTransaction`, `RestoreTransaction`; `Transfers\RegisterTransfer`, `UpdateTransfer` (legs rewritten in place), `DeleteTransfer`, `RestoreTransfer`, `SettleCreditCard` (`RegisterTransfer` with `card_settlement`); `Cards\SuggestCardSettlement`; `Tags\SyncTransactionTags`, `CreateTag`, `RenameTag` (409 `tag_name_taken`), `DeleteTag`; `QuickAdd\QuickAddDefaults`.
2. `Transactions\TransactionQuery` + `ListTransactionsRequest` (every filter in `API_CONTRACT.md` 3.7; category includes children; tags any/all; `q` with `f_unaccent(lower(...)) ILIKE` on the trigram index; transfer collapsing; `meta.totals`).
3. HTTP: `QuickAddController`, `TransactionsController` (index, store, show, update, destroy, restore), `TransfersController` (store, show, update, destroy, restore), `AccountsController@settlementSuggestion`, `TagsController`.
4. Tests: feature tests per endpoint and error code; filter matrix (each filter alone and combined); search "cafe" finds "Café" and "mercadona" finds "MERCADONA S.A."; transfer collapse; card scenario (purchase 100 € on day 3, statement day 5, suggestion on day 10 = 100 €, settle → card 0, period expense counts 100 € once); `LedgerInvariantsTest` (seeded random sequence of 300 operations: create/update/delete/restore transactions and transfers, settlements, adjustments; after each step net-worth change equals income − expense + adjustment deltas, and `app:ledger:verify` passes); `QuickAddPerformanceTest` (10k seeded rows: bounded query count for `POST /transactions` and a `GET /transactions` query count independent of page size in the default suite; `POST /transactions` under 300 ms locally in the `perf` group); "today" at 00:30 Madrid (22:30 UTC) defaults to the Madrid date.

**FE**
1. `features/transactions/quick-add` (sheet opened directly by the central "+" nav button and by a FAB on Movimientos; M3 adds Voz and Foto buttons inside this same sheet, so manual entry never costs an extra tap): `ui-money-input` autofocused; expense/income toggle (default expense); frequent category chips from `/quick-add/defaults`; Save. Date (today) and account (default) prefilled; "Más detalles" collapsed row with date, account, description, merchant, note, tags. **Flow: tap "+" → type amount → tap category → tap Guardar (3 taps).** Success toast with "Deshacer".
2. `features/transactions/list`: grouped by date with period totals, search (300 ms debounce), filter sheet (period or date range, accounts, categories, types, origin, tags any/all, amount range, with receipt), filters in URL query params, "load more" pagination with CDK virtual scroll, swipe or menu actions (edit, delete with undo toast calling restore).
3. `features/transactions/edit`: type-aware edit sheet (expense/income form with tags; adjustment edits target and date; transfer rows open the transfer form).
4. `features/transfers`: form (from, to, amount, date, note); list rows display "BBVA → Ahorro".
5. `features/accounts` detail: account movements (list filtered by account); for cards, "Liquidar tarjeta" with the suggestion prefilled, statement window shown, editable amount and source account.
6. `shared/ui/ui-combobox` + `features/transactions/tag-input` (autocomplete, create on Enter); tag management page under "Más".
7. Inicio (interim): total net balance, account list, last 10 movements.
8. Tests: quick-add tap count and defaults, money input, filter ↔ query-param mapping, tag input, settlement prefill; Playwright `m2-movements.spec.ts` (quick add in ≤ 3 taps, transfer, settlement, search and filter, edit, delete + undo).

**Acceptance criteria (RF-02, RF-03, RF-04, RF-07, ADR-005)**
1. An expense with defaults is saved with 3 taps after opening ("+" → category → Guardar; the amount is typed), dated today (Madrid) on the last used account; Playwright counts the clicks.
2. A 100 € transfer moves balances −100/+100, leaves net worth and period income/expense unchanged; deleting it restores both balances; editing it rewrites both legs; editing a leg through `/transactions` returns 409.
3. Card settlement: the card scenario above passes; the settlement never appears in expenses.
4. The list combines every filter (AND across fields, OR within multi-selects), tag filtering works in both modes, text search is accent- and case-insensitive, each transfer appears once without an account filter.
5. Tags are case-insensitive and unique; rename collisions return 409.
6. The ledger property test and the performance test pass; QA gate green.

---

### M3: AI capture by voice and photo (drafts, receipts, cleanup)

**Goal.** Record a movement by voice or photo, review an editable draft with low-confidence fields highlighted, confirm, and keep the receipt. Nothing is saved without confirmation.

**BE**
1. Migrations: `captures`, `drafts`, `attachments` (`DATA_MODEL.md` 3.8–3.10). Enums `CaptureKind`, `CaptureStatus`, `DraftOrigin`, `DraftStatus`, `DraftType`, `AttachmentKind`. Private disk `receipts` (`storage/app/private/receipts`, on the `appstorage` volume).
2. Config: `config/ai.php` `finance` section (ADR-002); `config/finance.php` `capture` section (`audio_mimes`, `image_mimes`, `max_audio_kb` 10240, `max_image_kb` 8192, `deadline_seconds` 15, `low_confidence_threshold` 0.7). `.env.example` model names chosen from OpenAI's current docs. `docs/ops/ai-providers.md` with A/B/C `.env` recipes.
3. `app/Ai/Agents/TransactionExtractor` (`Agent`, `HasStructuredOutput`): schema `type` (expense|income|transfer|null), `amount_cents` (integer|null), `date` (YYYY-MM-DD|null), `description`, `merchant`, `category_id`, `account_id`, `to_account_id`, `confidence` (object of 0..1 per field). Instructions from `resources/views/ai/transaction-extractor.blade.php`: Spanish context, today's Madrid date and weekday, relative dates ("ayer", "el viernes"), Spanish number words ("doce con cincuenta" → 1250), tickets (use the total, the purchase date, the merchant name), and compact JSON of active accounts (id, name, type) and categories (id, name, kind, parent). No history.
4. `app/Ai/CaptureProcessor`: `transcribe(Attachment)` (`Transcription::fromStorage(...)` with configured provider/model; MIME → extension map so iOS `audio/mp4` is sent as `.m4a`), `extract(string $transcript | Attachment $image)` (`prompt(..., attachments: [Files\Image::fromStorage(...)], provider:, model:, timeout:)`, failover from config when set); enforces the overall deadline; returns an `ExtractionResult` DTO; any `Throwable` becomes a failed result with the error and the transcript (if any).
5. `app/Ai/SanitizeExtraction` (rules in `API_CONTRACT.md` 3.10) → proposal, confidence, field sources, low-confidence list.
6. Actions: `Captures\CreateCapture` (validate, store with sha256, attachment row, capture row `processing`, process, sanitize, apply defaults, create `pending` draft, persist timings; one DB transaction for rows, file cleanup on failure), `Drafts\ConfirmDraft` (called by `RegisterTransaction`/`RegisterTransfer` when `draft_id` is set: lock draft `FOR UPDATE`, 409 `draft_not_pending`, compute `corrected_fields`, link attachments to the transaction or `out` leg, set `confirmed`), `Drafts\DiscardDraft` (delete files and attachment rows), `Attachments\AddTransactionAttachment`, `Attachments\DeleteAttachment` (409 `attachment_not_deletable`), `Drafts\PurgeOrphanDrafts`.
7. Command `app:drafts:purge` scheduled daily 03:30 Europe/Madrid: pending capture drafts older than `settings.orphan_draft_ttl_days` become `discarded` and their attachments (files + rows) are deleted; attachments with a `transaction_id` are never touched.
8. HTTP: `CapturesController@store` (throttle `captures`, 60/hour), `DraftsController` (index, show, discard), `AttachmentsController` (show/stream, index per transaction, store, destroy); `draft_id` accepted by `POST /transactions` and `POST /transfers`.
9. `tests/Pest.php` adds `TransactionExtractor::fake()->preventStrayPrompts()` globally. Tests (all faked): voice happy path (`Transcription::fake(['Veinte euros en Mercadona con la Visa'])` + extractor fake → draft with `amount_cents = 2000`, valid IDs); photo happy path (image attachment asserted with `assertPrompted`); prompt contains accounts, categories and today, and no movement history; sanitization (unknown IDs, negative amount, future date, transfer without destination, kind mismatch); provider exception and timeout → 201, `capture.status = failed`, transcript kept; low-confidence flags; no `transactions` row before confirm; confirm creates the movement with origin `voice`/`photo`, links attachments, stores `corrected_fields`; double confirm → 409; discard deletes files (`Storage::fake('receipts')`); purge removes orphans but never receipts; attachment download requires auth; MIME/size validation; config test switching `AI_EXTRACTION_PROVIDER`/`AI_*_MODEL` changes what is passed to the SDK.
10. `app:ai-eval {dir}` (manual, never in CI): runs `*.m4a|*.jpg` with `*.expected.json` through the real pipeline, prints per-field accuracy and latency; `tests/Fixtures/ai-eval/README.md`; samples git-ignored.
11. `app:ledger:verify` invariant 5.

**FE**
1. Capture entry points inside the quick-add sheet opened by the central "+": a hold-to-talk "Voz" button and a "Foto" button next to the amount field (the manual form stays the default and always works). `client_started_at` is recorded when the sheet opens.
2. `VoiceRecorder`: `MediaRecorder` with `isTypeSupported` negotiation (`audio/webm;codecs=opus`, fallback `audio/mp4` on iOS), hold-to-talk and tap-to-toggle, 60 s cap, timer and level meter, uploads with the right extension; permission-denied state.
3. `PhotoCapture`: `<input type="file" accept="image/*" capture="environment">` → `ImageCompressor` (`createImageBitmap(file, { imageOrientation: 'from-image' })`, canvas, longest side ≤ 1600 px, JPEG quality 0.8) → upload.
4. Processing state with spinner and cancel, then `features/drafts/review`: the shared movement form prefilled from `draft.proposal`; fields in `low_confidence_fields` use the wrapper `warning` state and an icon; source badges ("IA", "Por defecto"); transcript or photo thumbnail / audio player; Confirmar (→ `POST /transactions` or `/transfers` with `draft_id`, plus tags) and Descartar. On `capture.status = failed`: message plus the form with the transcript as description.
5. `features/drafts/inbox` ("Pendientes") with a badge on the nav (count from `GET /drafts` `meta.total`, refreshed on navigation and after captures).
6. Transaction detail: receipts (image preview, audio player, download link), add receipt, delete receipt.
7. Tests: recorder MIME negotiation (stubbed `MediaRecorder` in the spec), image compressor dimensions and quality, review highlighting, failure path, inbox badge; Playwright `m3-capture.spec.ts` with `/api/v1/captures` stubbed by route interception (voice and photo drafts, confirm, discard).

**Acceptance criteria (RF-10, RF-11, RF-12, ADR-002, ADR-006)**
1. Voice: upload → transcription → extraction → editable draft; photo: upload → extraction → editable draft; both proven with SDK fakes.
2. No `transactions` row exists before confirmation; low-confidence fields are flagged in the API and visibly highlighted in the UI.
3. A provider failure or timeout returns 201 with a usable draft (defaults plus transcript) within the deadline; manual entry keeps working.
4. After confirm the receipt is listed, viewable and downloadable from the movement; after discard, or after the orphan TTL, files and rows are gone; receipts of confirmed movements are never purged.
5. Provider and model come only from config/env (arch test for literals passes; config switch test passes); no test reaches the network.
6. Manual items logged in `QA_LOG.md`: iPhone Safari and installed PWA voice/photo flow, `app:ai-eval` latency (target p50 < 5 s) and accuracy.
7. QA gate green.

---

### M4: Recurring income and expenses (templates, idempotent generation, variable drafts, forecast)

**Goal.** Fixed movements record themselves on their date, variable bills ask for the real amount, and the current period shows what is still pending.

**BE**
1. Migrations: `recurring_templates`, `recurring_occurrences`; add `transactions.recurring_occurrence_id` (unique FK) and `drafts.recurring_occurrence_id` (unique FK) plus the drafts origin/occurrence CHECK. Enums `RecurringFrequency`, `RecurringType`, `OccurrenceStatus`.
2. `Domain\Recurring\RecurrenceSchedule` (pure): slots between two dates for a template; monthly/quarterly/yearly anchored on `starts_on`'s month; day clamping; `ends_on`; `slot_month` and `due_date`; `nextDueDate(today)`.
3. Actions: `Recurring\CreateRecurringTemplate`, `UpdateRecurringTemplate` (future only; `type` locked once occurrences exist), `PauseRecurringTemplate`, `ResumeRecurringTemplate` (slots during the pause become `skipped`), `DeleteRecurringTemplate` (discards pending drafts), `GenerateRecurringTransactions(asOf)` (ADR-014: `INSERT ... ON CONFLICT DO NOTHING RETURNING`, one DB transaction per occurrence, fixed → confirmed transaction with `origin = recurring`, variable → pending draft with `field_sources.amount_cents = template` and `low_confidence_fields = ['amount_cents']`, skipped cases recorded), `RecurringForecast(Period)`.
4. Extend `ConfirmDraft` (occurrence → `posted`) and `DiscardDraft` (occurrence → `skipped`).
5. Command `app:recurring:generate {--date=}` scheduled `dailyAt('06:00')->timezone('Europe/Madrid')->withoutOverlapping()`.
6. HTTP: `RecurringTemplatesController` (CRUD, pause, resume, `next_due_date`), `RecurringForecastController`; draft resources include the `recurring` block.
7. `app:ledger:verify` invariant 6.
8. Tests: schedule unit tests (day 31 in Feb and April, quarterly from February, yearly, `ends_on`, leap years); running the generator twice creates one row per slot; a pre-inserted occurrence (simulated race) prevents a second movement; unique violation on duplicate raw insert; 3-month catch-up with correct dates; soft-deleted generated movement is not regenerated; editing `day_of_month` or `month_start_day` mid-period does not duplicate; variable template → pending draft only, confirmed with the real amount → `origin = recurring` and occurrence `posted`; discard → `skipped`; paused/archived/opening-date skips; forecast with `month_start_day = 25`; schedule registration (06:00, Europe/Madrid) asserted via the `Schedule` events.

**FE**
1. `features/recurring`: template list (name, amount, next due date, "Variable" badge, paused state), form (type, name, amount — labelled "importe estimado" when variable — variable toggle with explanation, account, category, frequency, day, start and end dates), pause/resume, delete.
2. Drafts inbox: recurring drafts show "Introduce el importe real" and open a confirm sheet focused on the amount (one field plus Confirmar).
3. Inicio: "Fijos pendientes este periodo" card from `/recurring/forecast`.
4. Movement list: origin badge "Fijo" for `recurring`.
5. Tests: template form validation, variable confirm flow, forecast card; Playwright `m4-recurring.spec.ts` (create template, run generation through `docker compose exec web php artisan app:recurring:generate --date=...`, confirm variable draft).

**Acceptance criteria (RF-20, RF-21, RF-22, ADR-004, ADR-014)**
1. Monthly, quarterly and yearly templates generate confirmed movements with origin `recurring` ("Fijo") on their date; repeated or overlapping runs never duplicate (unique constraint proven).
2. A variable template produces a pending draft asking for the real amount; nothing reaches balances until confirmed.
3. After downtime, one run catches up every missed slot with its correct date; day 31 clamps to the month end.
4. The forecast lists the remaining occurrences of the current configurable period with correct pending and posted totals.
5. QA gate green.

---

### M5: Reports and dashboard (by category, 12-period trend, savings rate, net worth, usage metrics)

**Goal.** A reliable monthly report and a dashboard that answers "how am I doing this period".

**BE**
1. `app/Reports`: `PeriodSummaryReport` (income, expense, net, `savings_rate_bp`, category tree with parent rollup and `own_cents`, `share_bp`), `TrendReport` (one grouped SQL query over `PeriodResolver::lastN` ranges passed as a `VALUES` list, zero-filled, optional category incl. children), `NetWorthReport` (balances at date, assets/liabilities, `last_updated_on`, `stale`), `CaptureMetricsReport` (median and p90 seconds to confirm, unedited share, active days per week). All read through `Transaction::reportable()` (arch test: `App\Reports` never queries `transactions` without it, except `NetWorthReport` which uses `BalanceCalculator`).
2. HTTP: `ReportsController` (`summary`, `trend`, `netWorth`, `captureMetrics`) per `API_CONTRACT.md` 3.12.
3. `database/seeders/PerformanceSeeder` (50k movements over 3 years, transfers, adjustments, 40 categories).
4. Tests: golden fixtures with `month_start_day` 1 and 25 (salary 2 000 €, expenses 1 500 €, a 300 € transfer, a +50 € adjustment → income 200000, expense 150000, `savings_rate_bp` 2500); boundary dates (24 Oct in `2026-10` and 25 Oct in `2026-11` with d = 25); transfers, settlements and adjustments excluded; zero income → null; trend returns 12 zero-filled periods in a constant number of queries; net worth unchanged by a transfer and changed by an adjustment, card subtracts; metrics math; report totals equal a raw SQL cross-check; `perf` group: each report endpoint p95 < 300 ms on the performance seed (run in QA, excluded from the default parallel run).

**FE**
1. Load the `dataviz` skill before writing charts. `shared/charts`: `bar-chart`, `line-chart`, `donut-chart`, `stat-tile`, `progress-bar` (own SVG, accessible labels, light and dark).
2. `features/home` dashboard: period header with previous/next (labels show date ranges), income vs expense, savings rate, net worth with stale warnings, "Fijos pendientes" (M4), pending drafts count, top categories.
3. `features/reports`: period switcher; category breakdown with drill-down (parent → children → filtered movement list via query params); 12-period trend (income/expense bars, optional category line); savings-rate history; net-worth page with "Actualizado el …" per account and stale badges; "Calidad de captura" panel with the PRD targets (< 10 s, ≥ 80 % unedited, ≥ 5/7 days).
4. Tests: chart components from fixtures, period switcher, drill-down navigation; Playwright `m5-reports.spec.ts`.

**Acceptance criteria (RF-30, RF-31, RF-32, PRD metrics)**
1. All reports respect the configurable period; switching `month_start_day` re-buckets the history.
2. Report totals equal the sum of reportable rows in the period (raw SQL cross-check); transfers, settlements and adjustments never count.
3. Savings rate = (income − expense) / income, null with zero income.
4. Net worth = sum of balances with cards subtracting, and every account shows its last update date (stale warning for cash and savings older than 30 days).
5. Capture metrics return the PRD measures.
6. Report endpoints meet p95 < 300 ms on 50k movements (recorded in `QA_LOG.md`); QA gate green.

---

### M6: Budgets and budget vs actual

**Goal.** Monthly budgets per expense category that repeat until changed, with progress against actual spend.

**BE**
1. Migration `budgets` (generated `category_kind`, composite FK, `budgets_top_level_only` trigger, unique `(category_id, effective_from)`).
2. Actions: `Budgets\SetBudget(categoryId, amountCents, effectiveFrom)` (upsert; 422 for subcategories or income categories); `Budgets\ClearBudget(category)` (deletes every row of the category so it can be reparented). Read side: the domain service `App\Domain\Budgets\EffectiveBudgets(Period)` (latest `effective_from <= label` per category; 0 = none), used by `App\Reports` and the export without depending on `App\Actions`.
3. `Reports\BudgetVsActualReport(Period)`: per budgeted top-level category budget, actual (children included), remaining, `used_bp`, status (`ok` < 80 %, `warning` 80–100 %, `over` > 100 %), totals and unbudgeted spend.
4. HTTP: `BudgetsController` (`index`, `update` = PUT, `destroy` = DELETE, `history`), `ReportsController@budgetVsActual`.
5. Tests: a budget set in 2026-07 applies in 2026-08 and 2026-09; changing it in 2026-09 leaves 2026-08 unchanged; 0 in 2026-11 removes it from then on; DB rejects a budget on an income category or a subcategory; parent actual includes children; boundaries with `month_start_day = 25`; status thresholds.

**FE**
1. `features/budgets`: per-period list of top-level expense categories with inline amount editor ("se aplica desde este periodo"), period selector, history sheet.
2. Reports: "Presupuesto vs real" section with progress bars (colors at 80 % and 100 %); Inicio: compact card with the top 3 categories by usage.
3. Tests: editor, thresholds; Playwright `m6-budgets.spec.ts`.

**Acceptance criteria (RF-40, RF-33, ADR-015)**
1. A monthly budget per category repeats every period until changed, and changes apply only from their period on.
2. Budget vs actual per category is correct across period boundaries with a configurable start day, parents including their subcategories.
3. QA gate green.

---

### M7: Learned suggestions and full CSV export

**Goal.** Capture learns from corrections (same merchant or concept), and all data can be exported.

**BE**
1. Migration `categorization_hints`. `Domain\Text\HintKey` (ADR-017 normalization).
2. Actions: `Suggestions\LearnCategorization` (called from `RegisterTransaction`, `UpdateTransaction` and `ConfirmDraft` for expense/income with a merchant or description), `Suggestions\SuggestCategorization(kind, merchant, description)` (exact key, then trigram ≥ 0.6).
3. Capture integration: after `SanitizeExtraction`, a hint overrides category and account (`field_sources = history`, confidence 0.95, removed from `low_confidence_fields`), never for recurring drafts. Runs server-side; history is never sent to the provider.
4. Export: `Exports\ExportTransactionsCsv` (filters from `ListTransactionsRequest`, `response()->streamDownload`, `lazyById`, BOM, delimiter option, injection guard, columns per `API_CONTRACT.md` 3.15), `Exports\ExportFullArchive` (ZIP in a temp file, all entity CSVs, optional `receipts/`). Throttle `exports`.
5. HTTP: `SuggestionsController`, `ExportsController`.
6. Tests: `HintKey` table ("MERCADONA S.A." → "mercadona", "Café Pepe, 12" → "cafe pepe"); after correcting "Mercadona" from Ocio to Supermercado once, the next faked capture whose extractor returns Ocio yields Supermercado with source `history`, and the manual suggestion endpoint returns it; 204 without a hint; CSV header and rows, tags joined with `|`, BOM, both delimiters, injection guard, signed cents round-trip (sum per period equals `/reports/summary`); ZIP contains every file with headers; `perf` group: 50k-row export with peak memory < 64 MB.

**FE**
1. Quick-add and edit forms: on merchant/description blur, call `/suggestions/categorization` and fill category and account only if the user has not touched them, with a "Sugerido por tu historial" chip.
2. Draft review: "De tu historial" chip on fields with source `history`.
3. `features/export` under "Más": "Descargar exportación completa (ZIP)" with an include-receipts toggle; movement list: "Exportar CSV" with the current filters (plain same-origin download link).
4. Tests: suggestion only fills untouched fields, export URL built from filters; Playwright `m7-learning-export.spec.ts`.

**Acceptance criteria (RF-13, RF-50, ADR-005 tags in CSV, ADR-019)**
1. After one correction of a merchant's category, the next voice/photo draft and the manual form suggest the corrected category and account.
2. The CSV export opens correctly in Spanish Excel and LibreOffice (BOM, `;`, comma decimals), includes tags, and round-trips amounts exactly; the filtered export matches the list.
3. The full ZIP contains every entity (accounts, categories, transactions, transfers, tags, recurring templates, budgets, attachments index, settings).
4. QA gate green.

---

### M8: Operations hardening and release

**Goal.** Safe to run in production: encrypted off-site backups with a tested restore, HSTS and security headers, rate limiting and IP lockout, a tag-based release pipeline, and final PWA polish.

**IN**
1. `docker/backup/Dockerfile` (`postgres:18.6-alpine` + pinned `age`, `rclone`, `supercronic`) and `backup` service in `compose.prod.yaml` (ADR-031): daily 03:00 Madrid `pg_dump -Fc` + tar of `appstorage`, `age` encryption to `BACKUP_AGE_RECIPIENT`, upload to `BACKUP_REMOTE`, 30-day local and remote retention, heartbeat healthcheck (unhealthy after 26 h).
2. `scripts/restore.sh` (fetch, decrypt with the off-server key, restore into a scratch compose project, restore receipts, run `app:ledger:verify` and row counts) and `docs/ops/backup-restore.md`; perform one drill and record it in `QA_LOG.md`. `.github/workflows/restore-drill.yml` (manual + monthly): seed, back up with a CI key pair, restore into a fresh stack, verify.
3. Production Caddyfile headers (ADR-032), HTTP → HTTPS; HSTS only in prod.
4. `.github/workflows/release.yml` (tag `v*` → build and push `ghcr.io/<owner>/personal-finance:<tag>`); `scripts/deploy.sh <tag>`; CI step asserting no secrets in image layers (`docker history`/env grep).
5. `.github/dependabot.yml` (composer, npm, docker, github-actions; monthly; exact versions).
6. Docs: `docs/ops/deploy.md` (VPS or NAS, Tailscale-first, public reverse-proxy alternative, `.env` checklist, first run `app:create-user --with-defaults`), `docs/ops/security.md`, `docs/ops/maintenance.md` (monthly updates, PostgreSQL 19 upgrade path).

**BE**
1. Rate limiting: `api` 120/min per user on all `/api/v1`; confirm `captures` and `exports`.
2. `App\Http\Middleware\BlockAfterFailedLogins`: failed-login counter per IP in the cache table; 10 failures in 15 min → 403 `ip_blocked` for 60 min on `/api/v1/auth/*`; `auth.failed` and `auth.lockout` logged as warnings to stderr.
3. Session hardening verified (secure, http-only, `same_site=lax`, regenerate on login, logout clears remember token); `TrustProxies` from env.
4. Tests: lockout and unlock after TTL (`travel`), 121st API request → 429, attachment download requires auth, security-relevant session config.

**FE**
1. Login: friendly messages for 429 and 403 `ip_blocked`.
2. `SwUpdate` "Nueva versión disponible" prompt; offline banner (no offline mode); iOS meta (`apple-touch-icon`, `apple-mobile-web-app-capable`, status bar style) and splash icons.
3. Accessibility pass: tap targets ≥ 44 px, visible focus, contrast, labels on icon buttons; CSP compatibility of the build (no inline scripts; enable `autoCsp` if supported by Angular 22).
4. Full Playwright regression of M0–M7 journeys.

**Acceptance criteria (TRD §4.3, §8, §9, §11; PRD security and backup NFRs)**
1. `docker compose -f compose.yaml -f compose.prod.yaml up -d` from a pulled tag serves HTTPS with HSTS and the security headers (`curl -I`); the db has no published port; migrations run once through `migrate`.
2. The backup container produces encrypted DB and receipts archives that are unreadable without the private key, uploads them off-server, prunes copies older than 30 days, and its healthcheck turns unhealthy when stale.
3. `restore.sh` restores into a scratch stack and `app:ledger:verify` passes; the drill is recorded in `QA_LOG.md`.
4. 6 bad logins in a minute → 429; 10 failures from one IP in 15 min → 403 for an hour; > 120 API requests per minute → 429.
5. A `v*` tag pushes an immutable image to GHCR; `deploy.sh` deploys it.
6. Full regression and QA gate green; performance numbers (save p95 < 1 s, capture `extraction_ms` p95) recorded in `QA_LOG.md`.

## 5. Traceability matrix

### 5.1 PRD functional requirements

| RF | Requirement | Priority | Milestone | Main artifacts | Verified by |
|---|---|---|---|---|---|
| RF-01 | Create, edit, archive accounts of 4 types | P0 | M1 | `accounts`, `Accounts\*` actions, `features/accounts` | `AccountsTest`, DB constraint tests, `m1-ledger` |
| RF-02 | Manual expense/income in ≤ 3 taps with defaults | P0 | M2 | `RegisterTransaction`, `/quick-add/defaults`, quick-add sheet | `QuickAddTest`, tap-count Playwright, perf test |
| RF-03 | Transfers between accounts | P0 | M2 | `transfers` + legs, deferred trigger, `RegisterTransfer` | `TransfersTest`, `LedgerInvariantsTest` |
| RF-04 | Card settlement as transfer with suggested amount | P0 | M2 | `SuggestCardSettlement`, `SettleCreditCard` | card scenario test, `m2-movements` |
| RF-05 | Manual balance adjustment with date | P0 | M1 | `RecordBalanceAdjustment` (edit in M2) | `AdjustmentsTest` |
| RF-06 | Editable categories and subcategories | P0 | M1 | `categories` (composite FK, depth trigger), `features/categories` | `CategoriesTest`, DB tests |
| RF-07 | Movement list with search, filters, edit | P0 | M2 | `TransactionQuery`, list/edit features | filter matrix, search tests, `m2-movements` |
| RF-10 | Voice → transcript → extraction → editable draft | P0 | M3 | `CaptureProcessor`, `TransactionExtractor`, `VoiceRecorder` | faked voice tests, `m3-capture` |
| RF-11 | Ticket photo → same fields → editable draft | P0 | M3 | image attachment path, `PhotoCapture`, `ImageCompressor` | faked photo tests, `m3-capture` |
| RF-12 | Nothing saved without confirmation; low-confidence highlighted | P0 | M3 | `drafts`, `SanitizeExtraction`, review screen | no-row-before-confirm test, UI highlight test |
| RF-13 | Suggest category and account from previous corrections | P1 | M7 | `categorization_hints`, `LearnCategorization`, `SuggestCategorization` | learning-loop test, `m7-learning-export` |
| RF-20 | Recurring templates (monthly, quarterly, yearly) | P0 | M4 | `recurring_templates`, `RecurrenceSchedule` | schedule unit tests |
| RF-21 | Automatic generation on date, origin "fijo" | P0 | M4 | `recurring_occurrences`, `GenerateRecurringTransactions`, 06:00 schedule | idempotency, catch-up and schedule tests |
| RF-22 | Forecast of pending recurring in current month | P1 | M4 | `RecurringForecast`, Inicio card | forecast tests (d = 25) |
| RF-30 | Spend by category and 12-month evolution | P1 | M5 | `PeriodSummaryReport`, `TrendReport`, reports UI | golden fixture tests |
| RF-31 | Savings rate | P1 | M5 | `savings_rate_bp` | zero-income and fixture tests |
| RF-32 | Net worth with last update per account | P1 | M5 | `NetWorthReport`, `last_updated_on`, `stale` | net-worth tests |
| RF-33 | Budget vs actual per category | P2 | M6 | `BudgetVsActualReport` | budget-vs-actual tests |
| RF-40 | Monthly budget per category | P2 | M6 | `budgets` (versioned), `SetBudget` | repeat-until-changed tests |
| RF-50 | Full CSV export | P1 | M7 | `ExportTransactionsCsv`, `ExportFullArchive` | CSV/ZIP tests |

### 5.2 Owner decisions

| Decision | ADR | Milestone(s) |
|---|---|---|
| Scope P0 + P1 + P2 | ADR-001 | M0–M8 |
| OpenAI via `laravel/ai`, provider-agnostic config | ADR-002 | M0 (install, stray guards), M3 (implementation) |
| Configurable `month_start_day` | ADR-003 | M1 (setting, resolver); consumed in M2 (filters), M4, M5, M6 |
| Variable recurring → draft | ADR-004 | M4 |
| Tags | ADR-005 | M1 (tables), M2 (CRUD, filters), M7 (CSV) |
| Keep receipts | ADR-006 | M3 (receipts, cleanup), M8 (backup of receipts) |

### 5.3 TRD requirements

| TRD | Requirement | Milestone |
|---|---|---|
| §2 | Exact version pinning | M0 (`check-pins.sh`), every milestone |
| §3 | Same domain, FrankenPHP serving SPA + API + TLS, no Redis | M0 |
| §4.1–4.2 | web, worker, scheduler, db, frontend services; base/override/prod compose files | M0; `backup` M8 |
| §4.3 | Multi-stage Dockerfile, one image, healthchecks, secrets out of image, no db port in prod, migrations at deploy, named volumes | M0 (secret scan M8) |
| §5.1 | `/api/v1`, API Resources, Form Requests, `app/Actions`, `app/Ai/Agents` | M0 conventions, all milestones |
| §5.2 | Cents, `date`, enums + CHECK, computed balances, soft deletes, FKs and constraints | M1 |
| §5.2 | Transfer record with two legs in one DB transaction | M1 (schema), M2 (actions) |
| §5.2 | `UNIQUE (template, period)` | M4 |
| §5.3 | Sanctum SPA, `app:create-user`, no register, login rate limit, remember-me | M0 |
| §5.4 | Recurring at 06:00, idempotent | M4 |
| §5.4 | Attachment cleanup (changed by ADR-006) | M3 |
| §5.4 | Backup (by the `backup` service) | M8 |
| §6.1–6.2 | Capture flow, `TransactionExtractor` structured output, IDs + today in prompt, server validation, timeout and empty-draft fallback | M3 |
| §6.3 | Provider/model only in config; failover only for external providers | M3 |
| §6.4 | Fakes + `preventStray*` in all tests; anonymized eval set | M0 (guards), M3 (agent fake, `app:ai-eval`) |
| §7.1 | Standalone, signals, PWA assets-only SW, yukit-web + own components, CSRF/401 interceptor, dev proxy | M0 |
| §7.2 | MediaRecorder MP4/AAC, `<input capture>`, resize ≤ 1600 px, manual always works, local HTTPS | M0 (HTTPS), M3 (capture) |
| §8 | HTTPS + HSTS, VPN guidance, rate limiting + IP blocking, encrypted daily off-site backups with 30-day retention and a restore test, stderr logs, monthly updates | M0 (HTTPS, logs), M8 (rest) |
| §9 | Pest, Larastan, Pint, Vitest, ESLint, Prettier, CI on every push, deploy by tag | M0; release M8 |
| §10 | yukit-web risk, `laravel/ai` isolation, PostgreSQL 18 now / 19 later | M0 (gate, arch test, pins), M8 (upgrade doc) |
| §11 | Provider (A), hardware (no GPU needed), registry (GHCR), receipts (keep) | ADR-002, ADR-030, ADR-006 |

### 5.4 PRD non-functional requirements and metrics

| Item | Milestone | Evidence |
|---|---|---|
| Installable PWA, requires connection | M0, M8 | Lighthouse installability, offline banner |
| HTTPS, single user, persistent session | M0 | auth tests |
| Server-side transcription (no browser speech API) | M3 | `CaptureProcessor` |
| Extraction < 5 s, save < 1 s | M2 (save perf test), M3 (`extraction_ms`, `app:ai-eval`), M8 (recorded) | `QA_LOG.md` |
| Daily backups, Europe/Madrid | M8, M0 | backup service, timezone config |
| Metrics: capture time, unedited share, days active | M3 (data), M5 (report) | `capture-metrics` endpoint |
| Coverage ≥ 90 % vs bank statement | Manual monthly by the owner | CSV export (M7) helps the comparison |

## 6. Risk register

| Risk | Retired in | Fallback |
|---|---|---|
| yukit-web declares Angular ^21 only | M0 gate | ADR-026 ladder; wrappers contain any swap |
| iOS `audio/mp4` not accepted by STT through the SDK | M3 (extension map, manual iPhone check) | Server-side transcode with an `ffmpeg` layer (new ADR) |
| Extraction latency > 5 s | M3 (`extraction_ms`, `app:ai-eval`) | Faster model via `.env`; photo path is a single call |
| `laravel/ai` API churn | Exact pin, all usage in `app/Ai` | Upgrade only with the eval rerun |
| Deferred triggers silent under `RefreshDatabase` | M0/M1 (`SET CONSTRAINTS ALL IMMEDIATE` afterEach) | — |
| Pest 5 / Laravel 13 / PHP 8.5 incompatibility | M0 install | Latest compatible Pest 4.x, recorded in DECISIONS |
| Camera/mic need HTTPS on the phone in dev | M0 (Caddy local CA) | `tailscale cert` |

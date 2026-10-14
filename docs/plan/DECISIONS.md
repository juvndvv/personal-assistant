# Architecture decisions

ADR-style log. ADR-001 to ADR-006 are the owner's decisions; they override the open questions in the PRD (section "Preguntas abiertas") and the TRD (section 11). The rest are architectural choices made when consolidating three draft plans (domain-first, risk-first, vertical-slice). New decisions taken during implementation are appended with the next number, a date and the milestone.

Format: **Context**, **Decision**, **Consequences**. Status is `Accepted` unless stated.

---

## Owner decisions

### ADR-001 Scope: all of P0, P1 and P2

**Context.** The PRD ranks RF-01..RF-50 into P0/P1/P2 and suggests phases.
**Decision.** Deliver every requirement (RF-01..RF-07, RF-10..RF-13, RF-20..RF-22, RF-30..RF-33, RF-40, RF-50), including budgets and budget vs actual. Order follows priority where dependencies allow (see `IMPLEMENTATION_PLAN.md`).
**Consequences.** Nine sequential milestones (M0..M8). Each leaves the app buildable with green tests.

### ADR-002 AI provider: Option A (OpenAI only) through `laravel/ai`, provider-agnostic code

**Context.** TRD 6.3 offers A (single external provider), B (mixed) and C (local OpenAI-compatible servers). The PRD flags privacy and hardware.
**Decision.**
- Default: OpenAI for both speech-to-text and extraction (text and image), through Laravel AI SDK `laravel/ai` pinned exactly (v1.2.1 verified on 2026-10-13).
- Provider and model names exist only in `config/ai.php` and `.env`. `config/ai.php` gets a `finance` section:
  - `ai.finance.extraction.provider` ← `AI_EXTRACTION_PROVIDER` (default `openai`)
  - `ai.finance.extraction.model` ← `AI_EXTRACTION_MODEL`
  - `ai.finance.transcription.provider` ← `AI_TRANSCRIPTION_PROVIDER` (default `openai`)
  - `ai.finance.transcription.model` ← `AI_TRANSCRIPTION_MODEL`
  - `ai.finance.timeout_seconds` ← `AI_TIMEOUT` (default 12)
  - `ai.finance.failover` ← `AI_FAILOVER` (comma-separated providers; empty by default)
- Agents never use `#[Provider]`/`#[Model]` attributes; provider, model and timeout are passed at call time (`prompt(..., provider:, model:, timeout:)`, and the equivalent on `Transcription`; verify the exact `Transcription` signature in `vendor/laravel/ai/src` before coding).
- All SDK usage is isolated in `app/Ai` (arch test). An arch test also fails on provider/model literals (`gpt-`, `whisper`, `o4-`, `claude-`, `gemini-`) anywhere in `app/`.
- Model names in `.env.example` are chosen in M3 after checking OpenAI's current docs (a vision-capable mini text model for extraction and a current transcription model). They are not guessed in this plan.
- Options B and C are documented as `.env` recipes in `docs/ops/ai-providers.md` (C uses an `openai-compatible` provider with `url`, and a `models.transcription.default`).
- Privacy: only the audio or image, today's date and the catalog of accounts and categories (ids, names, kinds, parents) are sent. No movement history is ever sent; learned hints (RF-13) are applied server-side after extraction.
**Consequences.** Switching to B or C is a config change, proven by a config test. No GPU is needed in production (TRD 11 "hardware" resolved: VPS or NAS both work).

### ADR-003 Report month: configurable start day

**Context.** PRD open question: calendar month or payday to payday.
**Decision.** `settings.month_start_day` ∈ 1..28 (1 = calendar month, e.g. 25 = payday).
- A period with start day `d` runs from day `d` of a month to day `d − 1` of the next month (inclusive). With `d = 1`, the calendar month.
- **Label rule:** the period label is `YYYY-MM` of the month that holds most of its days: the start month when `d ≤ 15`, otherwise the month after the start month. Example, `d = 25`: 2026-09-25..2026-10-24 is `2026-10` ("October's money", paid on 25 September). `d = 10`: 2026-10-10..2026-11-09 is `2026-10`.
- The period containing date X: if `day(X) ≥ d`, it starts on day `d` of X's month; otherwise on day `d` of the previous month.
- `App\Domain\Period\PeriodResolver` is the only implementation (`forDate`, `fromLabel`, `current`, `lastN`, `next`, `previous`). Reports, budgets, savings rate, the recurring forecast, list filters (`period=`) and the dashboard all use it.
- Periods are never stored. Changing `d` re-buckets all history consistently. Budgets store a label (`effective_from`), so they keep applying "from this period onward" under the new definition.
**Consequences.** Frontend never computes periods itself; it asks `/periods*`. Exhaustive table tests for d ∈ {1, 2, 15, 16, 25, 28}, February, leap years and year rollover.

### ADR-004 Variable recurring templates produce a pending draft

**Context.** PRD risk: utility bills recorded with the template amount silently skew reports.
**Decision.** `recurring_templates.is_variable`. On its due date a variable template creates a `pending` draft with `origin = recurring`, amount pre-filled from the template (`field_sources.amount_cents = template`, flagged low-confidence), and the occurrence status `awaiting_amount`. Nothing reaches the ledger until the user confirms the real amount (the confirmed movement has `origin = recurring`, labelled "Fijo"). Non-variable templates post a confirmed movement directly.
**Consequences.** Shared draft inbox for AI captures and variable bills. The forecast shows `awaiting_amount` items.

### ADR-005 Free-form tags in addition to categories

**Decision.** Many-to-many `tags`/`tag_transaction`, attached to expense and income movements. Names are trimmed, lower-cased and unique. The list filters by tags (`any` or `all`), the quick-add "more details" row, the edit form and the draft confirm form accept tags (find-or-create by name), and the CSV export has a `tags` column (`|`-joined). Tags do not affect reports in v1.

### ADR-006 Keep receipts

**Context.** TRD 5.4 proposed deleting audio/photo after confirmation; TRD 11 left it open.
**Decision.** Attachments of confirmed drafts are kept as receipts, linked to the confirmed transaction (the `out` leg for transfers), viewable and downloadable. Receipts can also be added manually to any movement. Only attachments of **discarded** drafts (immediately) and of **orphaned pending drafts** older than `settings.orphan_draft_ttl_days` (default 7, daily job at 03:30) are deleted. Receipts are on the private `receipts` disk on the `appstorage` named volume, and are included in the encrypted backups (M8).
**Consequences.** Storage grows (≤ ~300 KB per resized photo). The backup covers both the database and the receipts volume.

---

## Domain and data

### ADR-007 Money: integer cents, signed ledger column

**Decision.** All amounts are `bigint` cents in the DB, `int` in PHP, integer `number` in TypeScript. `transactions.amount_cents` stores the signed effect on the account (expense < 0, income > 0, transfer legs ±, adjustment delta ≠ 0), with per-type CHECK constraints. Every other amount column is an unsigned magnitude. The API receives unsigned `amount_cents` plus `type` and returns both `amount_cents` and `signed_amount_cents`. Parsing and formatting of "12,50 €" happen only in the frontend (`parseEuroToCents`, `eur` pipe with `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })`). Ratios (savings rate, budget usage, shares) are integer basis points.
**Why.** A signed column makes `balance = opening + SUM(amount_cents)` a single aggregate and lets the DB enforce sign rules. Chosen over separate `transfer_out`/`transfer_in` types with a generated signed column (vertical draft) because it needs fewer types and the transfer trigger can check the legs directly.

### ADR-008 Dates and time

**Decision.** Movement dates are `date`, JSON `YYYY-MM-DD`, never converted to a JS `Date` with a timezone. `APP_TIMEZONE=Europe/Madrid`, the pgsql connection `timezone` is `Europe/Madrid`, timestamps are `timestamptz`. "Today" is `CarbonImmutable::today()` (app timezone); tests freeze time with `$this->travelTo()`. The frontend gets "today" with `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })`.

### ADR-009 Ledger holds only confirmed movements; drafts live in `drafts`

**Context.** The PRD gives movements a state (draft, confirmed). The risk-first and vertical drafts stored variable-recurring drafts as `transactions.status = draft`, and AI drafts in `captures`.
**Decision.** `transactions` contains only confirmed rows. All drafts (voice, photo, variable recurring) live in one `drafts` table with nullable proposal fields, per-field confidence and field sources. Capture processing metadata (transcript, raw output, timings, errors) lives in `captures` (1:1 with voice/photo drafts). Confirmation follows TRD 6.1: `POST /transactions` (or `POST /transfers` for transfer drafts) with `draft_id`; the server stores `corrected_fields` by diffing the submitted values against the proposal.
**Why.** No report, balance or budget query can forget a `status = confirmed` filter; drafts can have missing fields without weakening ledger constraints; one inbox serves both draft sources. The PRD's "estado borrador" is the `drafts` row.

### ADR-010 Transfers: one record, two legs, checked by a deferred constraint trigger

**Decision.** A `transfers` row plus two `transactions` legs (`out` on the source with `−amount`, `in` on the destination with `+amount`), created, updated (in place) and soft-deleted together inside one `DB::transaction` by `RegisterTransfer`/`UpdateTransfer`/`DeleteTransfer`. A `DEFERRABLE INITIALLY DEFERRED` constraint trigger validates the pair at commit. Legs cannot be edited through `/transactions` (409 `transfer_leg_immutable`). Without an account filter the list shows each transfer once (its `out` leg). Tests force deferred checks with `SET CONSTRAINTS ALL IMMEDIATE` in a global `afterEach` (see `DATA_MODEL.md`).

### ADR-011 Deferred-debit credit cards

**Decision.** A card is an account of type `credit_card` (balance usually negative). A purchase is an `expense` on the card at the purchase date. A settlement is a `transfer` of kind `card_settlement` from a non-card account to the card, so spending is counted once and the settlement never appears in expenses. `statement_day` (1..28) and `settlement_account_id` are optional card fields. The suggested settlement is the debt at the last statement close minus settlements made since (see `API_CONTRACT.md` 3.4). Refunds are recorded as income in v1.

### ADR-012 Balance adjustments are entered as a target balance

**Decision.** The user enters "the real balance on date D". The server stores an `adjustment` row with `amount_cents = target − balance_at(D)` and `adjustment_target_cents = target`. A zero delta is rejected (422). Editing recomputes the delta excluding the row itself. Adjustments are excluded from reports and included in balances and net worth. `balance_at(D)` includes every movement dated ≤ D, so a movement added later on the same day shifts the result; this is accepted and documented in the UI help text.

### ADR-013 Integrity in the database; tests on PostgreSQL

**Decision.** CHECK constraints for every enum and sign rule, composite foreign keys `(category_id, kind) → categories(id, kind)` so a movement, template, hint or budget can never point to a category of the wrong kind, PL/pgSQL triggers for cross-row rules (category depth, date ≥ opening date, writable account, card settlement accounts, top-level budgets, transfer legs). Each rule has a raw-insert test in `backend/tests/Database`. Tests always run on PostgreSQL 18; SQLite is never used. `php artisan app:ledger:verify` re-checks all invariants on existing data (used by QA and the restore drill).

### ADR-014 Recurring generation is idempotent through an occurrences table

**Context.** TRD 5.2 requires `UNIQUE (template_id, period)`.
**Decision.** `recurring_occurrences` with `UNIQUE (template_id, slot_month)`, where `slot_month` is the calendar month of the schedule slot (independent of `month_start_day` and of later edits to `day_of_month`). `GenerateRecurringTransactions(asOf)` enumerates every slot with `due_date ≤ asOf` from `starts_on` (catch-up after downtime, at most 36 slots per template per run), inserts occurrences with `INSERT ... ON CONFLICT DO NOTHING RETURNING id`, and only newly inserted occurrences produce a transaction (fixed) or a pending draft (variable). Each occurrence is processed in its own DB transaction. Day 29–31 clamps to the month's last day. Quarterly and yearly schedules are anchored on the month of `starts_on`. Generation starts at the latest of `starts_on`, `recurring_templates.generate_from` and the account's `opening_date`; slots before that bound and slots after `ends_on` are not generated and get no occurrence row. Once a template has occurrences, edits to `frequency`, `day_of_month`, `starts_on`, `account_id` or `ends_on`, and moving the account's `opening_date` earlier, set `generate_from` to the first day of the current month, so they never backfill months before the current month. Slots while paused or on an archived or deleted account are recorded as `skipped`. Soft-deleting a generated movement does not regenerate it. Scheduled daily at 06:00 Europe/Madrid with `withoutOverlapping()`.

### ADR-015 Budgets: top-level expense categories, versioned by period label

**Decision.** Budgets apply only to top-level expense categories (actual spend includes subcategories, which avoids double counting). A budget row has `effective_from` (period label) and repeats every period until a newer row exists. `amount_cents = 0` stops budgeting from that period on. Status thresholds: `warning` at 80 %, `over` above 100 %.

### ADR-016 Reports

**Decision.** Only live `expense`/`income` rows count (`Transaction::reportable()` scope, enforced by an arch test). Category breakdown rolls subcategories into their parent and shows the parent's own spend separately. Trend is one grouped SQL query over period ranges built by `PeriodResolver::lastN` (zero-filled). Savings rate is `round((income − expense) × 10000 / income)` basis points, null when income is 0. Net worth sums the balances of all non-deleted accounts (archived included) and shows `last_updated_on` and a `stale` flag per account. No materialized balances unless the M5 performance check (50k rows, p95 < 300 ms per report) fails; the TRD allows a recalculable cache if needed.

### ADR-017 Learned categorization (RF-13)

**Decision.** `categorization_hints` keyed by `(kind, normalized key)`: the merchant (or the description when there is no merchant), lower-cased, unaccented, with digits, punctuation and legal suffixes (`s.a.`, `s.l.`, `sl`, `sa`) removed and spaces collapsed. Every confirm or edit of an expense/income upserts the hint (last write wins for category and account, `hits++`). After extraction, a hint overrides the AI's category and account (`field_sources = history`, confidence 0.95). The manual form gets the same suggestion from `GET /suggestions/categorization`. Lookup: exact key first, then the best trigram match with similarity ≥ 0.6.

### ADR-018 Identifiers

**Decision.** `bigint` identity keys everywhere except `captures` and `attachments`, which use ULIDs so file URLs are not enumerable.

### ADR-019 CSV export format

**Decision.** UTF-8 with BOM, `;` delimiter by default (Spanish Excel), optional `comma`. `amount_cents` (signed integer, for machines) and `amount_eur` (signed, comma decimal with `;`). CRLF, RFC 4180 quoting, formula-injection guard. Streamed with `lazyById()` for constant memory. The full export is a ZIP of one CSV per entity.

---

## Backend architecture

### ADR-020 Layering

**Decision.**
- `app/Actions/<Area>/<Verb><Noun>.php`: final classes with one `handle()` method, each running in `DB::transaction` when it writes. Domain logic lives here and is tested without HTTP. TRD names are kept: `RegisterTransaction`, `RegisterTransfer`, `SettleCreditCard`, `GenerateRecurringTransactions`.
- `app/Domain/*`: pure value objects and services (`Money`, `Period`, `PeriodResolver`, `BalanceCalculator`, `RecurrenceSchedule`, `HintKey`).
- `app/Reports/*`: read-side query services.
- `app/Ai/*`: the only place that imports `Laravel\Ai` (`Agents/TransactionExtractor`, `CaptureProcessor`, `SanitizeExtraction`).
- Controllers are thin: Form Request → Action → API Resource. Domain conflicts throw `App\Exceptions\DomainConflict($code, $message)`, rendered as 409.
- `declare(strict_types=1)` everywhere; Larastan level 9; Pint with the Laravel preset.

### ADR-021 Capture is synchronous with a deadline

**Decision.** `POST /captures` stores the file, runs transcription (voice) and extraction inside the request, and returns 201 with the draft. Timeouts: `AI_TIMEOUT` per provider call and an overall `finance.capture.deadline_seconds` (15); PHP `max_execution_time` 45 and `upload_max_filesize`/`post_max_size` 12M in `docker/frankenphp/php.ini`. Any `Throwable` or timeout yields `capture.status = failed`, an error message and a usable draft (defaults plus transcript). The queue is not used for captures because polling would add latency against the < 5 s target; the decision can be revisited with measured data.

### ADR-022 Authentication

**Decision.** Sanctum SPA (`statefulApi()`), same origin, database sessions (`SESSION_LIFETIME=43200`), remember-me cookie, `SESSION_SECURE_COOKIE=true`, `same_site=lax`, http-only. `app:create-user {email} {--name=} {--password-stdin} {--with-defaults}` is the only way to create the user; it refuses if a user already exists; `--with-defaults` seeds the Spanish default category tree. Login is throttled (5/min per email+IP); progressive IP lockout arrives in M8.

### ADR-023 Testing strategy

**Decision.**
- Backend: Pest 5 (`pestphp/pest` 5.3.x with `pest-plugin-laravel` 5.0.x; verified to require PHP ≥ 8.4 and accept Laravel 13), arch plugin, Larastan 3.x level 9, Pint. Test DB `finance_test` on PostgreSQL 18, `LazilyRefreshDatabase`, parallel runs.
- Global test setup (`tests/Pest.php`): `Http::preventStrayRequests()`, `Transcription::fake()->preventStrayTranscriptions()`, and from M3 `TransactionExtractor::fake()->preventStrayPrompts()`; global `afterEach` running `SET CONSTRAINTS ALL IMMEDIATE`. No test can reach a real provider.
- Mocks (Mockery, `vi.fn`, Playwright route stubs) exist only in test files.
- Frontend: Vitest (Angular CLI default runner), Angular Testing Library style component tests, ESLint (`angular-eslint`), Prettier.
- End-to-end: Playwright (pinned, Chromium and WebKit) against the compose stack, one journey spec per milestone. AI endpoints are stubbed with Playwright route interception inside the spec files.
- AI accuracy: `php artisan app:ai-eval {dir}` runs anonymized real tickets/audios (git-ignored) against the configured provider. Manual only, never in CI; required before changing models.

---

## Frontend architecture

### ADR-024 Angular 22 structure

**Decision.** Standalone components only, zoneless change detection, signals and signal-based stores, `@if`/`@for` control flow, `OnPush`, lazy feature routes. Layout `frontend/src/app/{core, shared/ui, shared/charts, features/<feature>}`. UI copy in Spanish (`LOCALE_ID 'es'`, `registerLocaleData(es)`); code in English. Typed API clients in `core/api/*.api.ts` written by hand from `API_CONTRACT.md`, DTO types in `core/api/models.ts`. Interceptors: credentials, CSRF-retry (419 → refresh cookie, retry once), unauthorized (401 → `/login`). Filter state of lists lives in URL query params. Charts are own SVG components in `shared/charts` (bar, line, donut, progress), following the `dataviz` skill guidance; no extra UI or chart library.

### ADR-025 PWA without offline mode

**Decision.** `@angular/pwa` for manifest, icons and installability. `ngsw-config.json` has `assetGroups` only and no `dataGroups`; `navigationUrls` exclude `/api/**`, `/sanctum/**` and `/up`. `SwUpdate` prompts to reload on a new version. An offline banner explains that the app requires a connection.

### ADR-026 yukit-web on Angular 22: gated, behind own wrappers

**Context (verified 2026-10-13).** `yukit-web@0.3.4` (published that day, 7 releases in 8 days) declares `@angular/core|common|forms|router|cdk ^21.0.0`. Its other peers already accept Angular 22: `@spartan-ng/brain@1.6.3` (`>=21 <23`), `@ng-icons/core@32.5.0` (`>=20`), `embla-carousel-angular@21.0.0` (`>=21`), `@tanstack/angular-table@9.3.1`, `ngx-scrollbar@19.1.5`. Spartan also peers `tailwindcss >=4`, `tw-animate-css`, `luxon`, `clsx`. A probe install showed:
- without overrides: `npm` fails with `ERESOLVE` (peer `@angular/cdk@^21.0.0`);
- with `"overrides": { "yukit-web": { "@angular/core": "22.2.2", "@angular/common": "22.2.2", "@angular/forms": "22.2.2", "@angular/router": "22.2.2", "@angular/cdk": "22.2.2" } }` the tree resolves cleanly (literal versions are required: `$@angular/...` references failed with "Unable to resolve reference").

**Decision.**
1. Re-run `npm view yukit-web version peerDependencies` at M0 start. If a release declares Angular 22, pin it and drop the overrides.
2. Otherwise pin `yukit-web` exactly with the scoped overrides above (no global `legacy-peer-deps`), Tailwind 4, `tw-animate-css`, `luxon`, `clsx` and the spartan/ng-icons peers at exact versions; import `yukit-web/theme.css`.
3. Gate (M0): `npm ci` clean, `npm ls` without invalid peers, production `ng build` passes (the Angular linker must process the v21 partial-compiled library), and button, input, select, dialog, sheet, toast, tabs and table render in a dev-only `/dev/kitchen-sink` route and in a Vitest render test.
4. Fallback ladder if the gate fails: (a) the newest yukit-web version that passes; (b) yukit-web `theme.css` tokens and Tailwind classes only, with own components; (c) Angular 21, **only with the owner's approval** because it deviates from the TRD.
5. Regardless of the outcome, critical screens (login, quick-add, capture, draft review) use only own wrappers in `shared/ui` (`ui-button`, `ui-input`, `ui-money-input`, `ui-select`, `ui-combobox`, `ui-sheet`, `ui-dialog`, `ui-toast`, `ui-date-input`, `ui-empty-state`, `ui-badge`), so a library swap touches only that folder.
6. Frontend implementers load the `yurest-design` skill for brand tokens and yukit-web guidance.

The gate result is appended below as ADR-026a during M0.

### ADR-026a yukit-web gate result (2026-10-13, M0): PASSED with scoped overrides

**Context.** Gate defined in ADR-026, run at M0 start on `frontend/` (Angular 22.2.2, Node 22.23.1 / npm 10.9.8 on the host).

**Evidence.**
- `npm view yukit-web version peerDependencies` → `0.3.4`, still `@angular/core|common|forms|router|cdk ^21.0.0` (no Angular 22 release yet), `@spartan-ng/brain ^1.3.4`, `@ng-icons/core|lucide ^32.2.0`, `embla-carousel-angular ^21.0.0`, `@tanstack/angular-table ^9.0.0`, `ngx-scrollbar ^19.1.5`.
- Installed exact: `yukit-web` 0.3.4 with the ADR-026 scoped `overrides` (literal `22.2.2` for core, common, forms, router, cdk), `@angular/cdk` 22.2.2, `tailwindcss` 4.3.3, `@tailwindcss/postcss` 4.3.3, `postcss` 8.5.30, `tw-animate-css` 1.4.0, `luxon` 3.7.2, `clsx` 2.1.1, `@spartan-ng/brain` 1.6.3, `@ng-icons/core` 32.5.0, `@ng-icons/lucide` 32.5.0, `embla-carousel-angular` 21.0.0, `@tanstack/angular-table` 9.3.1, `ngx-scrollbar` 19.1.5. No global `legacy-peer-deps`.
- `rm -rf node_modules && npm ci` → clean, 0 vulnerabilities. `npm ls` exits 0; `npm ls --all` has no `invalid` or non-optional `UNMET` entries (only the optional `@angular/localize`, `@angular/platform-server`, `@angular/ssr` peers of `@angular/build`). Relevant lines:
  ```
  ├── @angular/cdk@22.2.2 overridden
  ├── @angular/core@22.2.2 overridden
  ├── @spartan-ng/brain@1.6.3
  ├── tailwindcss@4.3.3
  └── yukit-web@0.3.4 overridden
  ```
- Production `ng build` → success. The Angular linker processes the v21 partial-compiled library without warnings. Initial bundle 532.65 kB raw / 108.77 kB transfer; styles 232.93 kB / 26.85 kB.
- Kitchen sink: dev-only route `/dev/kitchen-sink` renders yukit-web button, input, select (`yuw-combobox readonlyTrigger`), dialog, sheet, toast, tabs and table, plus every `shared/ui` wrapper. `src/app/features/dev/kitchen-sink.page.spec.ts` (Vitest + Angular Testing Library) renders them, switches tabs, opens the dialog and sheet overlays and shows a toast: 6/6 passing. Visually checked in Chromium with the Yurest tokens applied.

**Decision.** Keep `yukit-web` 0.3.4 with the scoped overrides. Setup: `src/styles.css` imports `tailwindcss`, `@spartan-ng/brain/hlm-tailwind-preset.css` and `yukit-web/theme.css` with `@source "../node_modules/yukit-web"`; `.postcssrc.json` enables `@tailwindcss/postcss`. Drop the overrides as soon as a release declares Angular 22 peers (re-check with `npm view` each milestone).

**Consequences and findings.**
- `yukit-web` ships one non-tree-shakable FESM: importing any symbol pulls about 75 kB gzipped (yukit-web, spartan brain, CDK, tailwind-merge) into a shared chunk. Nothing in the eager path imports it (the toaster is mounted with `@defer (on idle)`, `AppUpdates` is UI-free), so the shared chunk loads with the first lazy route. The initial budget warning is set to 650 kB.
- The dev-only route is wired with a file replacement (`features/dev/dev.routes.ts` → `dev.routes.development.ts` in the `development` configuration) instead of an `environment.devTools` flag, because a runtime flag still emitted the kitchen-sink chunk into the production build and the service worker prefetched it. The production build contains no kitchen-sink chunk.
- `yuw-input`'s `invalid` only styles the field and does not set `aria-invalid`; `ui-input` and `ui-money-input` set `aria-invalid` and `aria-describedby` on the inner control themselves.
- `ui-select` and `ui-date-input` use native `<select>`/`<input type="date">` styled with the theme tokens (native pickers on iOS/Android, ISO strings with no `Date` objects).
- Critical screens use only the `shared/ui` wrappers (ADR-026 point 5). `ui-combobox` is not built in M0; it lands with the first screen that needs it (M1/M2).

---

## Infrastructure and operations

### ADR-027 Pinned versions (verified 2026-10-13)

| Component | Pin |
|---|---|
| PHP / web image | `dunglas/frankenphp:1.13.0-php8.5.11-alpine` (builder: `1.13.0-builder-php8.5.11-alpine`) |
| Laravel | `laravel/framework` v13.36.0 (lock) |
| `laravel/ai` | v1.2.1 (exact in `composer.json`) |
| `laravel/sanctum` | v4.3.3 |
| Pest / plugin-laravel / Larastan | v5.3.2 / v5.0.1 / v3.13.0 |
| PostgreSQL | `postgres:18.6-alpine` |
| Composer stage | `composer:2.10.3` |
| Node (Docker and CI) | `node:24.21.0-alpine` (active LTS; Angular CLI 22.2 requires `^22.22.3` or `^24.15.0`; the host's Node 22.23 also works) |
| Angular (core, cli, cdk, pwa) | 22.2.2 |
| yukit-web | 0.3.4 (see ADR-026) |
| Tailwind CSS | 4.3.3 |
| Vitest | 5.0.4 |
| Playwright | 1.64.0 |
| Backup tools (`docker/backup/Dockerfile`) | age 1.3.2, rclone 1.75.2, supercronic 0.2.49 (release binaries, sha256 pinned per arch) |

Rules: exact versions in `package.json` (`.npmrc` `save-exact=true`), committed `package-lock.json` and `composer.lock`, exact Docker tags (never `latest`, never a bare major). GitHub Actions pinned to exact release tags. `scripts/check-pins.sh` runs in CI and fails on `latest`, `^`/`~` ranges in `package.json`, and non-exact image tags in Dockerfiles and compose files. Implementers re-check with `npm view` / `composer show -a` at install time and update this table if they pin something newer.

### ADR-028 Single origin with FrankenPHP; local HTTPS

**Decision.** FrankenPHP (Caddy) is the only entry point in every environment. Production Caddyfile: `/api/*`, `/sanctum/*`, `/up` go to Laravel (`php_server`); everything else serves the Angular build from `public/app` with `try_files {path} /app/index.html`; `Cache-Control: no-cache` on `index.html` and `ngsw.json`. Dev Caddyfile (`docker/frankenphp/Caddyfile.dev`): same API routes, everything else `reverse_proxy frontend:4200` (HMR websockets), `tls internal`. A phone on the LAN or tailnet opens `https://<host>` after trusting Caddy's local root CA (`caddy_data` volume, `pki/authorities/local/root.crt`; steps in `docs/ops/local-https.md`). `proxy.conf.json` still supports plain `ng serve` on :4200 for desktop work.

### ADR-029 Docker Compose layout

**Decision.**
- `compose.yaml`: `web`, `worker` (`php artisan queue:work --tries=3`), `scheduler` (`php artisan schedule:work`), `db`. One image for the three app services; only `command` differs. Healthchecks: `web` → `/up`, `db` → `pg_isready`; `depends_on: condition: service_healthy`. Named volumes `pgdata`, `appstorage` (`backend/storage/app`), `caddy_data`, `caddy_config`. `LOG_CHANNEL=stderr`.
- `compose.override.yaml` (dev, auto-applied): `frontend` (`node:24.21.0-alpine`, `npm ci && npx ng serve --host 0.0.0.0`), bind mounts, ports 80/443 and `127.0.0.1:5432` for host tooling and tests, Xdebug via `XDEBUG_MODE` (off by default), a db init script creating `finance_test`.
- `compose.prod.yaml`: image `${APP_IMAGE}` (GHCR tag), `migrate` one-shot service (`php artisan migrate --force`, `restart: "no"`) that `web`, `worker` and `scheduler` wait for with `condition: service_completed_successfully`, `restart: unless-stopped`, no db ports, `backup` service (M8). Migrations never run in worker/scheduler entrypoints.
- Dockerfile multi-stage: `frontend-build` (node, `npm ci && npx ng build`), `vendor` (composer, `--no-dev --optimize-autoloader`), `runtime` (FrankenPHP with `pdo_pgsql intl zip bcmath opcache pcntl`, non-root user, Angular `dist/frontend/browser` copied to `public/app`), `dev` target (adds Xdebug and dev dependencies). Secrets are never baked into the image.
- `mailpit` is not included (no email features).

### ADR-029a Compose refinements found during M0

**Decision.**
- The project is named `personal-finance` (`name:` in `compose.yaml`), so volumes and containers do not collide with other stacks in a folder called `personal-assistant`.
- `web` publishes `${HTTP_PORT:-80}`, `${HTTPS_PORT:-443}` (TCP and UDP for HTTP/3) in `compose.yaml` because production needs them too; the dev db port is `127.0.0.1:${DB_HOST_PORT:-5432}`. All three are configurable for hosts where those ports are taken.
- Development also has a one-shot `migrate` service (`php artisan migrate --no-interaction`) that `web`, `worker` and `scheduler` wait for, so `docker compose up --wait` works on a fresh database. Entry points still never migrate.
- The `web` healthcheck calls `http://localhost:2080/up`, a loopback-only Caddy site that serves only `/up`. It works with any `SERVER_NAME` and certificate. `worker` and `scheduler` disable the healthcheck inherited from the FrankenPHP base image.
- The runtime entrypoint runs `php artisan optimize` when `APP_ENV=production`; the image is otherwise configured only through environment variables (no `.env` file inside it). The root `.env` feeds the containers; `backend/.env` is only for host-side commands.
- The dev `frontend` service keeps `node_modules` and `.angular` in named volumes so Linux binaries never overwrite the host's.
- `CADDY_SERVER_EXTRA_DIRECTIVES` (for example `tls internal` on a Tailscale-only production host) and `CADDY_GLOBAL_OPTIONS` are passed to `web`.

### ADR-030 Image registry and deploy

**Context.** TRD 11 open question.
**Decision.** CI builds the image on every push (no push). On tags `v*`, `release.yml` builds and pushes `ghcr.io/<owner>/personal-finance:<tag>` (immutable tag, never `latest`). Deployment is manual: `scripts/deploy.sh <tag>` pulls, runs the `migrate` service, `up -d`, and smoke-tests `/up`.

### ADR-031 Backups

**Decision.** Production `backup` service built from `docker/backup/Dockerfile` (`FROM postgres:18.6-alpine`, so `pg_dump` matches the server major, plus pinned `age`, `rclone`, `supercronic`). Daily at 03:00 Europe/Madrid: `pg_dump -Fc` and a tar of the `appstorage` volume (receipts), both encrypted with `age` to a public recipient (the private key never lives on the server), uploaded to an `rclone` remote (`BACKUP_REMOTE`), 30-day retention locally and remotely. A heartbeat file feeds a healthcheck that turns unhealthy after 26 h without success. `scripts/restore.sh` restores into a scratch stack and runs `app:ledger:verify`; one drill is recorded in `docs/plan/QA_LOG.md`, and `restore-drill.yml` runs it monthly in CI. The Laravel scheduler does not back up (TRD 5.4 allows either).

### ADR-031a Backup and release refinements found during M8

**Decision.**
- The backup image is released next to the app image as `ghcr.io/<owner>/personal-finance-backup:<tag>`; `compose.prod.yaml` uses `${BACKUP_IMAGE}` (default `personal-finance-backup:local`, buildable from `docker/backup`). `scripts/deploy.sh <tag>` pins both `APP_IMAGE` and `BACKUP_IMAGE` in `.env`.
- Remote credentials go in an optional `.env.backup` (`RCLONE_CONFIG_*`) loaded only by the `backup` service, so app containers never see them and the backup container never sees app secrets.
- Each backup is three age files (`pf-<stamp>-db.dump.age`, `-storage.tar.gz.age`, `-manifest.txt.age`). The encrypted manifest holds the archives' sha256, per-table row counts and the storage file count; `scripts/restore.sh` fails on any mismatch, checks every receipt against `attachments.sha256`, then runs `migrate --force` and `app:ledger:verify`.
- `scripts/restore-drill.sh` is the single drill implementation used locally (`make restore-drill`) and by `restore-drill.yml`.
- `scripts/check-image-secrets.sh` scans env, layer history, file names and application file contents; it runs in the CI `image` job and before every release push. `backend/storage/framework/cache/*` is excluded from the build context because the PHPStan container cache captured a developer API key.
- Release tags are immutable by policy: `release.yml` refuses to push a tag that already exists in GHCR. Platforms default to `linux/amd64`; the repository variable `RELEASE_PLATFORMS` adds `linux/arm64` for ARM NAS hosts.

### ADR-032 Security posture

**Decision.** HTTPS everywhere; HSTS (`max-age=31536000; includeSubDomains`) only in production. CSP `default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'` (tightened if the Angular build allows), `X-Content-Type-Options`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(self), microphone=(self)`, `X-Frame-Options: DENY`. Recommended exposure is Tailscale only; if exposed publicly, rate limiting plus IP lockout (10 failed logins per IP in 15 min → blocked 60 min, logged to stderr). `TrustProxies` configured for the chosen proxy. Monthly maintenance checklist (`composer outdated`, `npm outdated`, base images) and the PostgreSQL 19 upgrade path (dump/restore or `pg_upgrade` after 19.1 GA) in `docs/ops/maintenance.md`.

### ADR-033 Delivery workflow

**Decision.** Per milestone: Plan → Contract freeze → Implement (backend, frontend, infra agents in parallel against this folder) → Review (max 3 fix loops) → QA (automated gate plus milestone acceptance script) → orchestrator commit with Conventional Commits. Real-device checks (iPhone mic/camera, latency) are recorded in `docs/plan/QA_LOG.md` as manual items; they never block the automated gate but are listed as pending until done.

---

## Open items (non-blocking; defaults chosen)

| Item | Default |
|---|---|
| Off-site backup target (S3, B2, NAS) | Any `rclone` remote configured in `.env` |
| Production host (VPS or NAS) | Either; Option A needs no GPU |
| Start date and opening balances (PRD) | Entered by the owner per account (`opening_date`, `opening_balance_cents`) |
| Exact OpenAI model names | Chosen in M3 from OpenAI's docs, set in `.env` |

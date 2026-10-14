# API contract `/api/v1`

Backend and frontend both code against this file. If an implementer needs a change, they update this file first, in the same milestone, and the reviewer checks that code and contract match. Each endpoint lists the milestone (`M#`) that delivers it. Table shapes are in `DATA_MODEL.md`.

## 1. Conventions

### 1.1 Transport and auth

- Same origin for SPA and API (`https://<host>`). JSON only (`Accept: application/json`), except multipart uploads and file downloads.
- Laravel Sanctum SPA mode: session cookie plus CSRF. The SPA calls `GET /sanctum/csrf-cookie` once before login and again after a 419. Angular sends `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie (`withXsrfConfiguration`) and uses `withCredentials`.
- Every `/api/v1` route except `POST /auth/login` requires `auth:sanctum`. There is no register endpoint.
- Routes are defined in `backend/routes/api.php` with prefix `api/v1`. Controllers live in `App\Http\Controllers\Api\V1`, requests in `App\Http\Requests\Api\V1`, resources in `App\Http\Resources\Api\V1`.

### 1.2 Data formats

| Kind | Format |
|---|---|
| Money | Integer cents, field names end in `_cents`. **Requests send unsigned magnitudes** (`amount_cents >= 1`) plus a `type`/`kind`. Responses send `amount_cents` (unsigned magnitude) and, on ledger rows, `signed_amount_cents` (effect on the account). Balances (`balance_cents`, `target_balance_cents`, `opening_balance_cents`) are signed. Maximum magnitude: `99_999_999_99` (99,999,999.99 €). |
| Dates | `YYYY-MM-DD` strings, Europe/Madrid calendar dates. |
| Timestamps | ISO 8601 with offset (`2026-10-13T08:15:00+02:00`). |
| Period labels | `YYYY-MM` (see `DECISIONS.md` ADR-003). |
| IDs | Integers, except `captures` and `attachments` (ULID strings). |
| Booleans in query strings | `1`/`0`. |
| Arrays in query strings | `key[]=1&key[]=2`. |

### 1.3 Pagination

Paginated lists use Laravel's length-aware paginator:

```json
{
  "data": [ ... ],
  "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
  "meta": { "current_page": 1, "last_page": 4, "per_page": 50, "total": 180, "from": 1, "to": 50 }
}
```

Query: `page` (default 1), `per_page` (default 50, max 100). Non-paginated lists return `{ "data": [ ... ] }`.

### 1.4 Errors

| Status | When | Body |
|---|---|---|
| 401 | Not authenticated | `{ "message": "Unauthenticated." }` |
| 403 | Forbidden (blocked IP, M8) | `{ "message": "...", "code": "ip_blocked" }` |
| 404 | Unknown or soft-deleted resource | `{ "message": "..." }` |
| 409 | Domain conflict with current state | `{ "message": "<human message>", "code": "<code>" }` |
| 419 | CSRF token mismatch / expired | Laravel default. The SPA refreshes the CSRF cookie and retries once. |
| 422 | Validation (including domain validation of the input) | `{ "message": "...", "errors": { "field": ["..."] } }` |
| 429 | Rate limited | `{ "message": "Too Many Attempts." }` + `Retry-After` header |

409 codes:

| Code | Meaning |
|---|---|
| `account_has_movements` | Account cannot be deleted because it has live movements (archive it instead). |
| `opening_date_after_movements` | `opening_date` would move after existing movements. |
| `category_in_use` | Category is referenced by movements, templates or pending drafts. Budgets do not block deletion; they are deleted with the category (`ON DELETE CASCADE`). |
| `category_has_children` | Category has subcategories. |
| `transfer_leg_immutable` | A transfer leg was edited or deleted through `/transactions`; use `/transfers/{id}`. |
| `draft_not_pending` | The draft is already confirmed or discarded. |
| `tag_name_taken` | Rename collides with an existing tag (case-insensitive). |
| `attachment_not_deletable` | The attachment belongs to a pending capture (discard the draft instead). |
| `not_a_credit_card` | Settlement suggestion requested for a non-card account. |

Validation messages are Spanish (`lang/es`), field keys English.

### 1.5 Rate limiters

| Name | Limit | Applies to | Milestone |
|---|---|---|---|
| `login` | 5/min per email + IP | `POST /auth/login` | M0 |
| `captures` | 60/hour per user | `POST /captures` | M3 |
| `exports` | 6/min per user | `/exports/*` | M7 |
| `api` | 120/min per user | all `/api/v1` | M8 |
| IP lockout | 10 failed logins per IP in 15 min → 403 `ip_blocked` for 60 min | `/auth/*` | M8 |

Notes (M8):
- The `api` limiter is keyed by user id, or by client IP for guests. Guests on authenticated routes get 401 before the limiter runs, so for guests it only counts on `POST /auth/login`.
- IP lockout counts only rejected credentials (`Illuminate\Auth\Events\Failed`), not validation errors. The counter lives in the `database` cache store (`LOGIN_LOCKOUT_CACHE_STORE`) with a fixed 15-minute window from the first failure; a successful login from the IP resets it. The 10th failure still answers 422; every later `/auth/*` request from that IP answers 403 `{ "message": "...", "code": "ip_blocked" }` with a `Retry-After` header (seconds) until the hour expires. `auth.failed` (`ip`, `email`) and `auth.lockout` (`ip`, `failures`, `minutes`) are logged as warnings on the default (`stderr`) channel.
- The client IP is resolved through `TrustProxies`; `TRUSTED_PROXIES` (comma-separated IPs/CIDRs or `*`) must list the reverse proxy when one sits in front of FrankenPHP. Empty means no proxy is trusted.

## 2. Resource shapes

All `*Resource` classes return these shapes. Optional embedded objects are `null`, never omitted.

### 2.1 `User`

```json
{ "id": 1, "name": "Dani", "email": "dani@example.com" }
```

### 2.2 `Period`

```json
{ "label": "2026-10", "start": "2026-09-25", "end": "2026-10-24", "month_start_day": 25 }
```

### 2.3 `Settings`

```json
{
  "month_start_day": 25,
  "default_account_id": 3,
  "last_used_account_id": 3,
  "orphan_draft_ttl_days": 7,
  "current_period": { "label": "2026-10", "start": "2026-09-25", "end": "2026-10-24", "month_start_day": 25 }
}
```

### 2.4 `Account`

```json
{
  "id": 3,
  "name": "BBVA",
  "type": "checking",
  "opening_balance_cents": 150000,
  "opening_date": "2026-01-01",
  "statement_day": null,
  "settlement_account_id": null,
  "sort_order": 0,
  "archived_at": null,
  "balance_cents": 234567,
  "last_movement_date": "2026-10-12",
  "last_adjustment_date": null,
  "last_updated_on": "2026-10-12",
  "stale": false,
  "created_at": "2026-10-13T08:00:00+02:00"
}
```

`AccountSummary` (embedded): `{ "id": 3, "name": "BBVA", "type": "checking", "archived": false }`.

### 2.5 `Category` (tree node)

```json
{
  "id": 10, "kind": "expense", "name": "Alimentación", "parent_id": null,
  "icon": "shopping-cart", "color": "#2E7D32", "sort_order": 0, "archived_at": null,
  "children": [
    { "id": 11, "kind": "expense", "name": "Supermercado", "parent_id": 10, "icon": null, "color": null, "sort_order": 0, "archived_at": null, "children": [] }
  ]
}
```

`CategorySummary` (embedded): `{ "id": 11, "name": "Supermercado", "kind": "expense", "parent_id": 10, "parent_name": "Alimentación" }`.

### 2.6 `Tag`

```json
{ "id": 5, "name": "viaje roma", "usage_count": 12 }
```

`usage_count` is present only in `GET /tags`; embedded tags are `{ "id": 5, "name": "viaje roma" }`.

### 2.7 `Transaction`

```json
{
  "id": 120,
  "type": "expense",
  "account": { "id": 7, "name": "Visa", "type": "credit_card", "archived": false },
  "amount_cents": 2350,
  "signed_amount_cents": -2350,
  "date": "2026-10-12",
  "category": { "id": 11, "name": "Supermercado", "kind": "expense", "parent_id": 10, "parent_name": "Alimentación" },
  "description": "Compra semanal",
  "merchant": "Mercadona",
  "note": null,
  "origin": "voice",
  "tags": [ { "id": 5, "name": "casa" } ],
  "transfer": null,
  "adjustment_target_cents": null,
  "recurring_template_id": null,
  "attachments_count": 1,
  "created_at": "2026-10-12T19:02:11+02:00",
  "updated_at": "2026-10-12T19:02:11+02:00"
}
```

For `type = transfer`, `category` is null and:

```json
"transfer": { "id": 44, "kind": "card_settlement", "leg": "out", "counter_account": { "id": 7, "name": "Visa", "type": "credit_card", "archived": false } }
```

For `type = adjustment`, `adjustment_target_cents` is the target balance and `signed_amount_cents` the delta.

### 2.8 `Transfer`

```json
{
  "id": 44,
  "kind": "transfer",
  "from_account": { "id": 3, "name": "BBVA", "type": "checking", "archived": false },
  "to_account": { "id": 9, "name": "Ahorro", "type": "savings_investment", "archived": false },
  "amount_cents": 10000,
  "date": "2026-10-01",
  "note": null,
  "origin": "manual",
  "out_transaction_id": 130,
  "in_transaction_id": 131,
  "created_at": "2026-10-01T10:00:00+02:00"
}
```

### 2.9 `Attachment`

```json
{
  "id": "01JABCDEF...",
  "kind": "image",
  "mime": "image/jpeg",
  "size_bytes": 182334,
  "original_name": "ticket.jpg",
  "url": "/api/v1/attachments/01JABCDEF...",
  "download_url": "/api/v1/attachments/01JABCDEF...?download=1",
  "created_at": "2026-10-12T19:02:00+02:00"
}
```

### 2.10 `Capture`

```json
{
  "id": "01JABC...",
  "kind": "voice",
  "status": "completed",
  "transcript": "Veinte euros en Mercadona con la Visa",
  "error": null,
  "transcription_ms": 900,
  "extraction_ms": 2100,
  "attachments": [ { "...Attachment": "" } ],
  "created_at": "2026-10-12T19:01:58+02:00"
}
```

`status = failed` means the AI step failed; the draft is still usable (empty or partial proposals, transcript kept when available).

### 2.11 `Draft`

```json
{
  "id": 88,
  "origin": "voice",
  "status": "pending",
  "proposal": {
    "type": "expense",
    "amount_cents": 2000,
    "date": "2026-10-12",
    "account_id": 7,
    "to_account_id": null,
    "category_id": 11,
    "description": "Mercadona",
    "merchant": "Mercadona"
  },
  "confidence": { "type": 0.95, "amount_cents": 0.98, "date": 0.6, "account_id": 0.9, "category_id": 0.55, "description": 0.9, "merchant": 0.9 },
  "field_sources": { "type": "ai", "amount_cents": "ai", "date": "default", "account_id": "ai", "category_id": "history", "description": "ai", "merchant": "ai" },
  "low_confidence_fields": [ "category_id" ],
  "capture": { "...Capture": "" },
  "recurring": null,
  "transaction_id": null,
  "transfer_id": null,
  "corrected_fields": null,
  "confirmed_at": null,
  "discarded_at": null,
  "created_at": "2026-10-12T19:02:00+02:00"
}
```

For `origin = recurring` (M4), `capture` is null and:

```json
"recurring": { "template_id": 4, "template_name": "Luz", "occurrence_id": 31, "due_date": "2026-10-05", "is_variable": true }
```

Field-source values: `ai` (extractor), `history` (learned hint, M7), `template` (recurring template), `default` (server default such as today or the last used account).

### 2.12 `RecurringTemplate` (M4)

```json
{
  "id": 4, "name": "Luz", "type": "expense", "amount_cents": 6000, "is_variable": true,
  "account": { "id": 3, "name": "BBVA", "type": "checking", "archived": false },
  "category": { "id": 21, "name": "Electricidad", "kind": "expense", "parent_id": 20, "parent_name": "Vivienda" },
  "frequency": "monthly", "day_of_month": 5, "starts_on": "2026-01-01", "ends_on": null,
  "description": "Iberdrola", "merchant": "Iberdrola", "note": null,
  "paused_at": null, "next_due_date": "2026-11-05", "created_at": "..."
}
```

### 2.13 `Budget` (M6)

```json
{ "category": { "id": 10, "name": "Alimentación", "kind": "expense", "parent_id": null, "parent_name": null }, "amount_cents": 40000, "effective_from": "2026-07" }
```

`amount_cents` is null and `effective_from` null when the category has no effective budget in the requested period.

## 3. Endpoints

### 3.1 Health and CSRF (M0)

| Method | Path | Notes |
|---|---|---|
| GET | `/up` | Laravel health route. 200 when the app boots and the DB answers. No auth. |
| GET | `/sanctum/csrf-cookie` | 204, sets `XSRF-TOKEN`. No auth. |

### 3.2 Auth (M0)

#### `POST /api/v1/auth/login` (throttle `login`)

Request: `{ "email": "dani@example.com", "password": "secret", "remember": true }` (`remember` optional, default false).
Response 200: `{ "data": User }`. The session is regenerated.
Errors: 422 `errors.email` = "Credenciales incorrectas" (same message for unknown email and wrong password); 429.

#### `POST /api/v1/auth/logout`

Response 204. Invalidates the session, regenerates the CSRF token, clears the remember cookie.

#### `GET /api/v1/auth/me`

Response 200 `{ "data": User }`; 401 when the session is missing.

#### `PUT /api/v1/auth/password` (throttle `password`)

Request: `{ "current_password": "...", "password": "...", "password_confirmation": "..." }` (min 12 chars).
Response 204. Errors: 422; 429 (throttle `password`: 5 attempts per minute keyed by user id and IP). Other sessions of the user are logged out; the current session is kept and regenerated.

### 3.3 Settings and periods (M1)

#### `GET /api/v1/settings` → 200 `{ "data": Settings }`

#### `PATCH /api/v1/settings`

Request (all optional): `{ "month_start_day": 25, "default_account_id": 3, "orphan_draft_ttl_days": 7 }`.
Validation: `month_start_day` integer 1..28; `default_account_id` existing, non-archived account or null; `orphan_draft_ttl_days` 1..90.
Response 200 `{ "data": Settings }`.

#### `GET /api/v1/periods/current?month_start_day=25` → 200 `{ "data": Period }`

`month_start_day` (1..28) is optional and only previews the current period under a different start day (used by the settings screen before saving); nothing is persisted.

#### `GET /api/v1/periods?count=12&until=2026-10`

`count` 1..36 (default 12); `until` a period label (default current). Returns the `count` periods ending at `until`, **oldest first**: `{ "data": [Period, ...] }`.

#### `GET /api/v1/periods/resolve?date=2026-10-24` → 200 `{ "data": Period }`

### 3.4 Accounts (M1)

#### `GET /api/v1/accounts?include_archived=0`

Non-paginated, ordered by `type`, `sort_order`, `name`. `{ "data": [Account, ...] }`.

#### `POST /api/v1/accounts`

Request:

```json
{ "name": "Visa", "type": "credit_card", "opening_balance_cents": -12000, "opening_date": "2026-10-01",
  "statement_day": 5, "settlement_account_id": 3, "sort_order": 0 }
```

Validation: `name` 1..80, unique (case-insensitive) among non-deleted; `type` enum; `opening_balance_cents` integer (signed); `opening_date` date, not in the future; `statement_day` 1..28 and `settlement_account_id` (non-card account) only when `type = credit_card`, otherwise prohibited.
Response 201 `{ "data": Account }`.

#### `GET /api/v1/accounts/{id}` → 200 `{ "data": Account }`; 404.

#### `PATCH /api/v1/accounts/{id}`

Same fields as POST, all optional; `type` cannot change once the account has movements (422 `errors.type`).
Errors: 409 `opening_date_after_movements`.

#### `DELETE /api/v1/accounts/{id}`

Soft delete. 204. Errors: 409 `account_has_movements`.

#### `POST /api/v1/accounts/{id}/archive` / `POST /api/v1/accounts/{id}/unarchive`

200 `{ "data": Account }`. Archived accounts are hidden from pickers, reject new movements (422 `errors.account_id` on create), and still count in net worth. Archiving clears `settings.default_account_id`/`last_used_account_id` if they point to it.

#### `GET /api/v1/accounts/{id}/balance?date=2026-10-01`

200 `{ "data": { "account_id": 3, "date": "2026-10-01", "balance_cents": 120000 } }`. `date` defaults to today.

#### `POST /api/v1/accounts/{id}/adjustments` (RF-05)

Request: `{ "date": "2026-10-13", "target_balance_cents": 1250000, "note": "Valor cartera" }`.
The server computes `delta = target − balance_at(date)` and stores an `adjustment` transaction with `signed_amount_cents = delta`.
Response 201 `{ "data": Transaction }`.
Errors: 422 `errors.target_balance_cents` when the delta is 0; 422 `errors.date` when before `opening_date` or in the future; 422 `errors.account_id` on an archived account.

#### `GET /api/v1/accounts/{id}/settlement-suggestion?date=2026-10-13` (RF-04, M2)

200:

```json
{ "data": {
  "card_account_id": 7,
  "statement_start": "2026-09-06",
  "statement_end": "2026-10-05",
  "statement_balance_cents": -45230,
  "settled_since_cents": 0,
  "suggested_cents": 45230,
  "from_account_id": 3
} }
```

Rules: with `statement_day = d`, `statement_end` is the latest date ≤ `date` with day `d`; `statement_start` is the day after the previous one. `suggested_cents = max(0, −balance_at(statement_end) − settlements dated in (statement_end, date])`, where settlements are live `card_settlement` transfers into the card and `settled_since_cents` is that sum. Without `statement_day`, `statement_start`/`statement_end` are null and `suggested_cents = max(0, −balance_at(date))`. `from_account_id` is the card's `settlement_account_id` (or `settings.default_account_id` when it is a writable non-card account; otherwise null).
Errors: 409 `not_a_credit_card`.

### 3.5 Categories (M1)

#### `GET /api/v1/categories?kind=expense&include_archived=0`

Tree: `{ "data": [Category, ...] }`, top-level ordered by `sort_order`, `name` (children likewise). Without `kind`, both kinds (expense first). Without `include_archived=1`, archived categories and the children of archived parents are omitted.

#### `POST /api/v1/categories`

Request: `{ "kind": "expense", "name": "Supermercado", "parent_id": 10, "icon": "shopping-cart", "color": "#2E7D32", "sort_order": 0 }`.
Validation: name 1..60 unique per `(kind, parent)`; `parent_id` must be a top-level, non-archived category of the same kind.
Response 201 `{ "data": Category }`.

#### `PATCH /api/v1/categories/{id}`

Fields: `name`, `icon`, `color`, `sort_order`, `parent_id` (only to another top-level category of the same kind, and only if the category has no children; violations return 422 `errors.parent_id`). `kind` is immutable: it may be echoed back unchanged, any other value returns 422 `errors.kind`. Response 200.

#### `POST /api/v1/categories/{id}/archive` / `unarchive` → 200 `{ "data": Category }`

Archiving a parent hides its children from pickers.

#### `DELETE /api/v1/categories/{id}`

204. Errors: 409 `category_in_use`, 409 `category_has_children`.

### 3.6 Quick add (M2)

#### `GET /api/v1/quick-add/defaults`

```json
{ "data": {
  "date": "2026-10-13",
  "account_id": 3,
  "frequent_category_ids": { "expense": [11, 14, 31, 22, 40, 12, 18, 27], "income": [50, 51] }
} }
```

`account_id`: `last_used_account_id` if writable, otherwise `default_account_id`, otherwise the first non-archived account. Frequent categories: up to 8 per kind, ranked by count over the last 90 days, ties by most recent use; padded with remaining non-archived leaf categories by `sort_order`.

### 3.7 Transactions (M2)

#### `GET /api/v1/transactions` (RF-07)

Query parameters (all optional, combined with AND; multi-value parameters OR within themselves):

| Param | Meaning |
|---|---|
| `q` | Accent- and case-insensitive substring over description, merchant and note |
| `type[]` | `expense`, `income`, `transfer`, `adjustment` |
| `account_id[]` | Accounts |
| `category_id[]` | Categories; a parent includes its children |
| `tag_id[]` + `tag_mode` | `any` (default) or `all` |
| `origin[]` | `manual`, `voice`, `photo`, `recurring` |
| `period` | Period label; overrides `date_from`/`date_to` |
| `date_from`, `date_to` | Inclusive dates |
| `amount_min_cents`, `amount_max_cents` | Inclusive, on the unsigned magnitude |
| `has_attachments` | `1` / `0` |
| `sort` | `-date` (default; ties by `-id`), `date`, `-amount`, `amount` |
| `page`, `per_page` | Pagination |

Transfer collapsing: without `account_id[]`, each transfer appears once (its `out` leg, with `counter_account`). With `account_id[]`, the legs on the selected accounts are returned.
Response 200 paginated `Transaction` list, plus `meta.totals`: `{ "income_cents": 0, "expense_cents": 0 }` over the whole filtered set (reportable rows only). Both totals are unsigned magnitudes.

Details (M2): `q` is matched literally (`%` and `_` are not wildcards) and must be valid UTF-8; transfer legs carry the transfer's `note`, so `q` also finds transfers. `amount`/`-amount` sort on the magnitude (ties by `-id`). `period` must be a valid label. `date_to` before `date_from`, `amount_max_cents` below `amount_min_cents`, or `per_page` outside 1..100 return 422. From M3, `has_attachments=1` returns rows with at least one receipt and `has_attachments=0` rows without any; `attachments_count` is the number of receipts linked to the row.

#### `POST /api/v1/transactions` (RF-02; draft confirm from M3)

Request:

```json
{
  "type": "expense",
  "amount_cents": 2350,
  "date": "2026-10-12",
  "account_id": 7,
  "category_id": 11,
  "description": "Compra semanal",
  "merchant": "Mercadona",
  "note": null,
  "tags": ["casa"],
  "draft_id": null
}
```

Validation: `type` in `expense|income`; `amount_cents` integer 1..99_999_999_99; `date` (omitted or null) defaults to today, not before the account's `opening_date`, not more than 366 days in the future; `account_id` defaults to the quick-add default account and must be writable; `category_id` required, non-archived, kind = `type`; `tags` array of up to 10 strings 1..40 chars (find-or-create, case-insensitive); `draft_id` optional (M3+), must be `pending` (before M3 any non-null `draft_id` returns 422 `errors.draft_id`). Domain validation of the account, category and date is reported as 422 on `account_id`, `category_id` and `date`.
Effects: creates the row with `origin = manual`, or the draft's origin when `draft_id` is set; sets `settings.last_used_account_id`; with `draft_id`: in the same DB transaction marks the draft `confirmed`, stores `corrected_fields` (proposal fields whose submitted value differs), links capture attachments to the new transaction, and, for recurring drafts (M4), marks the occurrence `posted`; learns a categorization hint (M7).
Response 201 `{ "data": Transaction }`.
Errors: 422; 409 `draft_not_pending`.

#### `GET /api/v1/transactions/{id}` → 200 `{ "data": Transaction }`

#### `PATCH /api/v1/transactions/{id}`

- Expense/income rows: any of `type` (`expense|income`, re-signs the amount and requires a matching category), `amount_cents`, `date`, `account_id`, `category_id`, `description`, `merchant`, `note`, `tags` (replaces the set).
- Adjustment rows: `date`, `target_balance_cents`, `note`; the delta is recomputed excluding the row itself (422 if it becomes 0; `date` must not be in the future or before the account's `opening_date`). Other fields are ignored.
- An already assigned archived category may be kept; switching to an archived category, or to an archived account, returns 422.
- Transfer legs: 409 `transfer_leg_immutable`.

Response 200 `{ "data": Transaction }`.

#### `DELETE /api/v1/transactions/{id}`

Soft delete, 204. Transfer legs: 409 `transfer_leg_immutable`. Attachments stay linked (restorable).

#### `POST /api/v1/transactions/{id}/restore`

Restores a soft-deleted expense/income/adjustment (undo). 200 `{ "data": Transaction }`. 422 if the account is now archived. Transfer legs: 409.

### 3.8 Transfers and card settlement (M2)

#### `POST /api/v1/transfers` (RF-03, RF-04)

Request: `{ "kind": "transfer", "from_account_id": 3, "to_account_id": 9, "amount_cents": 10000, "date": "2026-10-01", "note": null, "draft_id": null }`.
Validation: `kind` default `transfer`; accounts distinct and writable; `card_settlement` requires `to` = credit card and `from` ≠ credit card; date rules as transactions.
Effects: one DB transaction creates the transfer and both legs (origin = draft origin or `manual`). With `draft_id` (M3), the draft is confirmed as with transactions and attachments go to the `out` leg.
Response 201 `{ "data": Transfer }`.

#### `GET /api/v1/transfers/{id}` → 200 `{ "data": Transfer }`

#### `PATCH /api/v1/transfers/{id}`

Fields: `from_account_id`, `to_account_id`, `amount_cents`, `date`, `note`, `kind`. Both legs are rewritten in place atomically (same leg ids). Only an account that changes must be writable. 200.

`Transfer.origin` is the origin of its legs. `POST /transfers/{id}/restore` returns 422 (`errors.from_account_id` / `errors.to_account_id`) when either account is now archived; restoring a live transfer is a no-op.

#### `DELETE /api/v1/transfers/{id}` → 204 (soft-deletes the transfer and both legs)

#### `POST /api/v1/transfers/{id}/restore` → 200 `{ "data": Transfer }`

### 3.9 Tags (M2)

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/v1/tags?q=rom` | | 200 `{ data: [Tag] }` ordered by usage desc, max 50 | |
| POST | `/api/v1/tags` | `{ "name": "viaje roma" }` | 201 `{ data: Tag }` (returns the existing tag with 200 if the name exists) | 422 |
| PATCH | `/api/v1/tags/{id}` | `{ "name": "..." }` | 200 | 409 `tag_name_taken` |
| DELETE | `/api/v1/tags/{id}` | | 204 (detaches from movements) | |

Names are trimmed and lower-cased on save. Names must not contain `|` (the tag separator of the CSV export, §3.15); `POST`/`PATCH /tags` and `tags.*` on movements return 422 otherwise.

### 3.10 Captures, drafts and attachments (M3)

#### `POST /api/v1/captures` (RF-10, RF-11; throttle `captures`)

Multipart form:

| Field | Rules |
|---|---|
| `kind` | `voice` or `photo` |
| `file` | voice: MIME in `config('finance.capture.audio_mimes')` (`audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/webm`, `audio/ogg`, `audio/mpeg`, `audio/wav`), ≤ 10 MB; photo: `image/jpeg`, `image/png`, `image/webp`, ≤ 8 MB |
| `client_started_at` | Optional ISO timestamp (when the capture screen opened) |

Processing is synchronous within `config('finance.capture.deadline_seconds')` (default 15). The file is stored on the private `receipts` disk and an `Attachment` is created. Voice is transcribed, then extracted; photo is extracted from the image. The output is sanitized server-side and a `pending` draft is created.
Response **201 always when the upload is valid**, also when AI fails:

```json
{ "data": { "capture": Capture, "draft": Draft } }
```

On AI failure `capture.status = failed`, `capture.error` is a short message, `draft.proposal` holds only defaults (`date` today, `account_id` default account, `type` expense) and, for voice, `description` = transcript when the transcript exists. All non-default fields are listed in `low_confidence_fields`.
Errors: 422 (MIME, size); 429.

Sanitization rules (`App\Ai\SanitizeExtraction`):
- Unknown, archived or wrong-kind `account_id`/`to_account_id`/`category_id` → null, confidence 0.
- `amount_cents` ≤ 0 or > max → null, confidence 0.
- `date` in the future → today, confidence 0.3, flagged. Exception (scheduled transfer): when the final `type` is `transfer` (after the destination check) and the date is at most 366 days ahead (`MovementRules::MAX_DAYS_IN_FUTURE`), the date is kept with confidence 0.3, source `ai`, flagged. Missing date → today, source `default` (not flagged).
- `type = transfer` without a valid `to_account_id` → `expense`, flagged.
- Category kind conflicting with `type` → category null, flagged.
- Missing account → default account, source `default`, flagged.
- A field is low-confidence when its confidence < `config('finance.capture.low_confidence_threshold')` (0.7) or it was nulled by sanitization.

#### `GET /api/v1/drafts?status=pending&origin[]=voice`

`status` default `pending`. Paginated `Draft` list, newest first. `meta.total` drives the inbox badge.

#### `GET /api/v1/drafts/{id}` → 200 `{ "data": Draft }`

#### `POST /api/v1/drafts/{id}/discard`

200 `{ "data": Draft }` with `status = discarded`. Deletes the capture's attachment files and rows immediately. For recurring drafts (M4) the occurrence becomes `skipped`. Errors: 409 `draft_not_pending`.

Confirming a draft is `POST /transactions` or `POST /transfers` with `draft_id` (see above).

Details (M3):
- Upload MIME: the type detected from the file content must be in the configured list. For voice, containers that `finfo` reports differently are mapped to their audio type (`video/mp4` and `audio/m4a` → `audio/mp4`, `video/webm` → `audio/webm`, `application/ogg` → `audio/ogg`, `audio/x-wav` → `audio/wav`, `audio/mp3` → `audio/mpeg`, `audio/x-hx-aac-adts` → `audio/aac`); when detection only yields `application/octet-stream`, the client MIME is used if it is in the list. Photos must be detected as one of the image types. The stored `mime` is the resolved type.
- `draft_id` pointing to no draft returns 422 `errors.draft_id`; an existing draft that is not `pending` returns 409 `draft_not_pending`. A recurring draft (M4) cannot be confirmed through `POST /transfers` (422 `errors.draft_id`).
- `corrected_fields` lists the proposal fields whose confirmed value differs from the proposal, compared on the stored row (`date` and `account_id` after defaults, texts trimmed): `type`, `amount_cents`, `date`, `account_id`, `category_id`, `description`, `merchant` for transactions (plus `to_account_id` when the proposal had one); `type`, `amount_cents`, `date`, `account_id` (from), `to_account_id` for transfers. Unedited confirmations store `[]`.
- `confidence` has a value for every non-null proposal field and `0` for fields nulled by sanitization; `field_sources` lists only non-null fields. A missing date gets confidence 1 (`default`, not flagged); an unparseable date becomes today, `default`, flagged.
- On AI failure `low_confidence_fields` is `["amount_cents", "category_id", "description", "merchant"]`; `type` (`expense`), `date` (today) and `account_id` (default account) are `default` and not flagged.
- `GET /attachments/{id}` also serves the file of a pending capture so the review screen can show the photo or play the audio. Unknown or malformed ULIDs return 404.
- `POST /transactions/{id}/attachments` on an `adjustment` row returns 422 `errors.file`. Soft-deleted movements keep their receipts (the routes return 404 for the movement itself, as with every soft-deleted resource).
- `GET /drafts` validates `status` (`pending|confirmed|discarded`), `origin[]` and `per_page` (1..100) with 422.
- Category deletion returns 409 `category_in_use` while a pending draft references the category.

#### `GET /api/v1/attachments/{id}`

Streams the file with its `Content-Type`, `Content-Disposition: inline` (or `attachment` with `?download=1`), `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=3600`. 401 when unauthenticated, 404 when unknown.

#### `GET /api/v1/transactions/{id}/attachments` → 200 `{ "data": [Attachment] }`

#### `POST /api/v1/transactions/{id}/attachments`

Multipart `file` (same MIME/size rules as captures; kind inferred). Adds a receipt to an existing expense/income/transfer leg. 201 `{ "data": Attachment }`.

#### `DELETE /api/v1/attachments/{id}`

Deletes a receipt linked to a transaction (row and file). 204. Errors: 409 `attachment_not_deletable`.

### 3.11 Recurring (M4)

#### `GET /api/v1/recurring-templates?include_paused=1` → `{ "data": [RecurringTemplate] }`

#### `POST /api/v1/recurring-templates`

Request:

```json
{ "name": "Luz", "type": "expense", "amount_cents": 6000, "is_variable": true, "account_id": 3, "category_id": 21,
  "frequency": "monthly", "day_of_month": 5, "starts_on": "2026-11-01", "ends_on": null,
  "description": "Iberdrola", "merchant": "Iberdrola", "note": null }
```

Validation: kinds match; account writable; `day_of_month` 1..31; `starts_on` defaults to today. Response 201.

#### `GET /api/v1/recurring-templates/{id}` → 200

#### `PATCH /api/v1/recurring-templates/{id}`

Any field except `type` after the template has occurrences (422). Changes affect only occurrences not yet generated. 200.

#### `DELETE /api/v1/recurring-templates/{id}` → 204 (soft delete; generated movements stay; pending drafts of this template are discarded)

#### `POST /api/v1/recurring-templates/{id}/pause` / `resume` → 200

Resuming does not backfill slots whose due date fell while paused; they are recorded as `skipped`.

#### `GET /api/v1/recurring/forecast?period=2026-10` (RF-22)

`period` defaults to current.

```json
{ "data": {
  "period": Period,
  "items": [
    { "template_id": 4, "template_name": "Luz", "type": "expense", "due_date": "2026-10-05", "amount_cents": 6000,
      "is_variable": true, "status": "awaiting_amount", "draft_id": 91, "transaction_id": null }
  ],
  "pending_expense_cents": 6000,
  "pending_income_cents": 0,
  "posted_expense_cents": 85000,
  "posted_income_cents": 210000
} }
```

`status`: `upcoming` (slot in the period, not generated yet), `awaiting_amount` (variable draft pending), `posted`, `skipped`. Pending totals sum `upcoming` + `awaiting_amount` (template amount as estimate).

Details (M4):
- `GET /recurring-templates`: `include_paused` defaults to `0`; soft-deleted templates are never listed; ordered by name (case-insensitive). Unknown or deleted ids return 404.
- `next_due_date` is the first slot due on or after today whose calendar month has no occurrence yet; `null` while paused or once `ends_on` has passed.
- Template validation: account must exist and be writable (422 `errors.account_id`); category must exist, be non-archived and match `type` (422 `errors.category_id`); `ends_on` before `starts_on` (or before today when `starts_on` is omitted) returns 422 `errors.ends_on`. On PATCH, the account and category are only re-checked when they (or `type`) change, so an already assigned archived category may be kept. Texts are trimmed; empty texts become null.
- The first slot is the first due date on or after the latest of `starts_on`, the account's `opening_date` and the template's internal no-backfill floor (`generate_from`, see DATA_MODEL §3.11). Slots before that bound and slots after `ends_on` are not generated (no occurrence row) and not listed by the forecast. Once a template has occurrences, PATCHing `frequency`, `day_of_month`, `starts_on`, `account_id` or `ends_on`, or moving the account's `opening_date` earlier, never backfills months before the current month (a slot already due in the current month may still be generated). Generated movements and drafts use `description = template.description ?? template.name`. Variable drafts have `confidence.amount_cents = 0.5` and `1` for the other template fields.
- A confirmed recurring draft links its transaction to the occurrence (`transaction.recurring_template_id` is set for every movement generated from a template, fixed or variable).
- Pause stops generation for slots due on or after the pause day (they are recorded `skipped` as they come due). Resume records every missing slot due from the pause day until yesterday as `skipped`; a slot due today is generated by the next run. Pause and resume are idempotent.
- Forecast: a `posted` occurrence whose movement was soft-deleted, and an `awaiting_amount` occurrence whose draft was discarded, are reported as `skipped` with null ids. Posted items use the movement's real type and amount. Missing slots that the generator would skip (paused, archived/deleted account) are reported as `skipped`; slots before the generation lower bound (`opening_date`, `starts_on`, no-backfill floor) are not listed. Templates deleted after posting keep their generated items; their missing slots are dropped.
- `DELETE /accounts/{id}` also soft-deletes the account's templates (discarding their pending drafts). `DELETE /categories/{id}` returns 409 `category_in_use` while any template (including soft-deleted ones) references it.
- `php artisan app:recurring:generate [--date=YYYY-MM-DD]` prints `Recurring as of <date>: N posted, N awaiting amount, N skipped.` and exits non-zero when an occurrence fails (each failure is printed and retried on the next run).

### 3.12 Reports and dashboard (M5; budget report M6)

All reports read only reportable rows (confirmed live expense/income). Periods come from `PeriodResolver`.

#### `GET /api/v1/reports/summary?period=2026-10` (RF-30, RF-31)

```json
{ "data": {
  "period": Period,
  "income_cents": 210000,
  "expense_cents": 157500,
  "net_cents": 52500,
  "savings_rate_bp": 2500,
  "by_category": {
    "expense": [
      { "category_id": 10, "name": "Alimentación", "amount_cents": 42000, "share_bp": 2667, "own_cents": 2000,
        "children": [ { "category_id": 11, "name": "Supermercado", "amount_cents": 40000, "share_bp": 2540 } ] }
    ],
    "income": [ ... ]
  }
} }
```

`savings_rate_bp` = round((income − expense) × 10000 / income) using integer math, null when income is 0; it can be negative. `share_bp` is the share of the kind total. `own_cents` is spend booked directly on the parent. Categories with zero amount are omitted. Top-level nodes always carry `own_cents` and `children` (possibly `[]`); child nodes carry only `category_id`, `name`, `amount_cents`, `share_bp`. Nodes are sorted by `amount_cents` descending, then name. Archived categories still appear when they have movements in the period. `period` defaults to the current period; an invalid label is 422 `errors.period`.

#### `GET /api/v1/reports/trend?periods=12&until=2026-10&category_id=10`

`periods` 1..24 (default 12). Oldest first, zero-filled:

```json
{ "data": [ { "period": Period, "income_cents": 210000, "expense_cents": 157500, "savings_rate_bp": 2500, "category_cents": 42000 } ] }
```

`category_cents` is present only with `category_id` (parent includes children; magnitude, works for income categories too). `until` defaults to the current period. Errors: 422 on `periods` (not 1..24), `until` (not `YYYY-MM`) and `category_id` (unknown).

#### `GET /api/v1/reports/net-worth?date=2026-10-13` (RF-32)

```json
{ "data": {
  "date": "2026-10-13",
  "total_cents": 1834500,
  "assets_cents": 1879730,
  "liabilities_cents": -45230,
  "accounts": [ { "id": 3, "name": "BBVA", "type": "checking", "archived": false, "balance_cents": 234567, "last_updated_on": "2026-10-12", "stale": false } ]
} }
```

`date` defaults to today (422 when not a valid `YYYY-MM-DD`). Balances are at `date`; accounts include archived ones and exclude deleted ones, in the same order as `GET /accounts`. `assets_cents` is the sum of positive balances and `liabilities_cents` the sum of negative balances (so a card in debt subtracts), `total_cents = assets_cents + liabilities_cents`. `last_updated_on` and `stale` follow `DATA_MODEL.md` §4, with staleness measured against today.

#### `GET /api/v1/reports/capture-metrics?period=2026-10` (PRD metrics)

```json
{ "data": {
  "period": Period,
  "captures_confirmed": 34,
  "median_seconds_to_confirm": 8.4,
  "p90_seconds_to_confirm": 14.0,
  "unedited_share_bp": 8235,
  "active_days": 22,
  "elapsed_days": 26,
  "active_days_per_week": 5.9
} }
```

Time to confirm = `drafts.confirmed_at − captures.client_started_at` (fallback `captures.created_at`, floored at 0) over voice/photo drafts confirmed (Madrid date of `confirmed_at`) within the period; `captures_confirmed` counts them. Unedited = confirmed capture drafts with empty or null `corrected_fields`. Active days = distinct Madrid dates of `created_at` of reportable (live `expense`/`income`) transactions with origin `manual|voice|photo` within the period's elapsed days (period start through today, or the whole period once it has ended; 0 for a future period). `active_days_per_week = active_days × 7 / elapsed_days`. Seconds and `active_days_per_week` are the only non-integer outputs (display values rounded to one decimal; JSON may serialize `8.0` as `8`). With no confirmed captures the two seconds fields and `unedited_share_bp` are null; with `elapsed_days = 0`, `active_days_per_week` is null.

#### `GET /api/v1/reports/budget-vs-actual?period=2026-10` (RF-33, M6)

```json
{ "data": {
  "period": Period,
  "items": [ { "category": CategorySummary, "budget_cents": 40000, "actual_cents": 42000, "remaining_cents": -2000, "used_bp": 10500, "status": "over" } ],
  "budgeted_cents": 120000,
  "actual_budgeted_cents": 98000,
  "unbudgeted_actual_cents": 59500
} }
```

`actual_cents` includes subcategories (archived ones too). `status`: `ok` (< 80 %), `warning` (80–100 %), `over` (> 100 %); thresholds compare `actual_cents` and `budget_cents` exactly, so `used_bp` (rounded) may read `10000` while `status` is `over`. `items` holds every non-archived top-level expense category with an effective budget > 0 in the period (including those with no spend), in category order (`sort_order`, name). `budgeted_cents` sums the items' budgets, `actual_budgeted_cents` their actuals, and `unbudgeted_actual_cents` is the period's total expense minus `actual_budgeted_cents`. `period` defaults to current; invalid label is 422 `errors.period`.

### 3.13 Budgets (M6, RF-40)

#### `GET /api/v1/budgets?period=2026-10`

Every non-archived top-level expense category, with its effective budget for the period: `{ "data": [Budget] }`. Ordered by `sort_order`, then name. `period` defaults to current; invalid label is 422 `errors.period`.

#### `PUT /api/v1/budgets/{category_id}`

Request: `{ "amount_cents": 40000, "effective_from": "2026-10" }` (`effective_from` defaults to the current period; `amount_cents` ≥ 0, 0 = stop budgeting). Upserts the `(category_id, effective_from)` row.
Response 200 `{ "data": Budget }` (the effective budget from `effective_from`; after `amount_cents = 0` both `amount_cents` and `effective_from` are null). Errors: 404 for an unknown category id; 422 `errors.category_id` when the category is an income category, a subcategory or archived; 422 `errors.amount_cents` (missing, not an integer, outside 0..`99_999_999_99`) and `errors.effective_from` (not `YYYY-MM`).

#### `GET /api/v1/budgets/{category_id}/history` → `{ "data": [ { "effective_from": "2026-07", "amount_cents": 40000 } ] }` (newest first)

Includes `amount_cents = 0` rows (stops). 404 for an unknown category id.

#### `DELETE /api/v1/budgets/{category_id}` → 204

Deletes every budget row of the category (stops included), so its history becomes empty and it has no budget in any period. Idempotent: 204 also when the category has no rows. 404 for an unknown category id. `PATCH /categories/{id}` with a `parent_id` returns 422 `errors.parent_id` ("Elimina su presupuesto antes de convertirla en subcategoría.") while the category has budget rows; clearing them with this endpoint lifts the lock (the `categories_budgeted_top_level_only` trigger stays as the safety net).

### 3.14 Suggestions (M7, RF-13)

#### `GET /api/v1/suggestions/categorization?type=expense&merchant=Mercadona&description=`

200 `{ "data": { "category_id": 11, "account_id": 7, "source": "history", "hits": 6 } }` or 204 when there is no hint. Lookup: exact normalized key (merchant first, then description), then the best trigram match with similarity ≥ 0.6.

Details (M7):
- `type` is required (`expense|income`, 422 `errors.type`); `merchant` (≤ 120) and `description` (≤ 255) are optional. Without any usable text the answer is 204.
- Keys follow `App\Domain\Text\HintKey` (DECISIONS ADR-017): lower-case, unaccented, digits and punctuation removed, trailing legal suffixes (`s.a.`, `s.l.`, `sa`, `sl`) dropped, spaces collapsed. "MERCADONA S.A." and "Mercadona" share the key `mercadona`.
- Trigram ties are broken by `hits`, then `last_used_at` (newest first).
- Hints whose category (or its parent) is archived are ignored. `account_id` is `null` when the learned account is archived or deleted.
- Learning: every `POST /transactions` (including draft confirmation) and every `PATCH /transactions/{id}` that changes the type, category, account, merchant or description of an `expense`/`income` row with a usable merchant or description upserts the `(kind, key)` hint (category and account: last write wins; `hits + 1`). Transfers, adjustments and generated recurring movements (including confirmed variable recurring drafts) never learn.
- Captures: after sanitization, when the extraction succeeded and the proposal is `expense`/`income`, a hint sets `category_id` (and `account_id` when the hint has a usable account) with `field_sources = history`, confidence `0.95`, and removes them from `low_confidence_fields`. Failed extractions keep the M3 fallback proposal. Recurring drafts never use hints. The provider never receives hints or history.

### 3.15 Export (M7, RF-50; throttle `exports`)

#### `GET /api/v1/exports/transactions.csv?<same filters as GET /transactions>&delimiter=semicolon`

Streamed CSV, UTF-8 with BOM, `delimiter` `semicolon` (default) or `comma`, CRLF line endings, RFC 4180 quoting, formula-injection guard (text cells starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`; integer cells and plain decimal numbers such as `amount_cents`, `amount_eur` and `adjustment_target_cents` are never prefixed, so negative amounts stay numeric). Every leg is exported (no transfer collapsing): the rows are the list's filtered set plus the `in` legs the list collapses. Rows are ordered by `id`. Soft-deleted rows are excluded. Columns:

`id; date; type; account; account_type; category; parent_category; amount_cents; amount_eur; description; merchant; note; tags; origin; transfer_id; transfer_kind; transfer_leg; counter_account; adjustment_target_cents; recurring_template; attachments_count; created_at`

`amount_cents` is signed; `amount_eur` is signed with a comma decimal separator when the delimiter is `semicolon`, dot otherwise. `tags` are joined with `|`. `category` is the row's category name and `parent_category` its parent's name (empty for top-level categories); `counter_account` is the other account of a transfer leg; `recurring_template` is the template name; `attachments_count` counts receipts as in the list; `created_at` is ISO 8601. Null values are empty cells. Response headers: `Content-Type: text/csv; charset=UTF-8`, `Content-Disposition: attachment; filename=movimientos-<YYYY-MM-DD-HHMMSS>.csv`. Errors: 422 for invalid list filters (same rules as `GET /transactions`) and for `delimiter`; 429 after 6 exports per minute (shared with `full.zip`).

#### `GET /api/v1/exports/full.zip`

ZIP (built in a temp file, then streamed) containing `accounts.csv` (with current balance), `categories.csv`, `transactions.csv` (as above, unfiltered, including soft-deleted rows with a `deleted_at` column), `transfers.csv`, `tags.csv`, `recurring_templates.csv`, `budgets.csv`, `attachments.csv` (index: id, transaction_id, kind, mime, size, sha256, original_name), `settings.csv`. Receipt files are included under `receipts/` only with `?include_receipts=1`.

Details (M7): query `include_receipts` (`1`/`0`, default `0`) and `delimiter` (as above). Every CSV uses the transactions CSV format (BOM, CRLF, quoting, guard, signed `*_eur` with the delimiter's decimal separator). Response `Content-Type: application/zip`, `Content-Disposition: attachment; filename=finanzas-<YYYY-MM-DD-HHMMSS>.zip`; the temp file is deleted after sending. Files and columns, in this order:

| File | Columns |
|---|---|
| `accounts.csv` | `id; name; type; opening_balance_cents; opening_date; statement_day; settlement_account_id; sort_order; balance_cents; balance_eur; archived_at; created_at; deleted_at` (soft-deleted accounts included with empty balance) |
| `categories.csv` | `id; kind; name; parent_id; parent_name; icon; color; sort_order; archived_at; created_at` |
| `transactions.csv` | the transactions CSV columns plus `deleted_at` (every row, soft-deleted included) |
| `transfers.csv` | `id; kind; date; from_account_id; from_account; to_account_id; to_account; amount_cents; amount_eur; note; created_at; deleted_at` |
| `tags.csv` | `id; name; transactions_count; created_at` |
| `recurring_templates.csv` | `id; name; type; amount_cents; amount_eur; is_variable; account_id; account; category_id; category; frequency; day_of_month; starts_on; ends_on; description; merchant; note; paused_at; created_at; deleted_at` |
| `budgets.csv` | `id; category_id; category; effective_from; amount_cents; amount_eur; created_at` |
| `attachments.csv` | `id; transaction_id; kind; mime; size; sha256; original_name; file; created_at` (kept receipts only, i.e. linked to a movement; `file` is the path inside the ZIP when receipts are included, empty otherwise) |
| `settings.csv` | `month_start_day; default_account_id; last_used_account_id; orphan_draft_ttl_days; updated_at` |

With `include_receipts=1`, each receipt whose file exists is stored as `receipts/<attachment id>.<extension>`.

# Finanzas

Personal finance app for a single user: an Angular 22 PWA and a Laravel 13 API served from one
origin by FrankenPHP (Caddy), with PostgreSQL 18. Product and technical requirements live in
`docs/product/`; the implementation plan, data model, API contract and decisions live in
`docs/plan/`.

| Path | Contents |
|---|---|
| `backend/` | Laravel API (`/api/v1`), Pest, PHPStan, Pint. See `backend/README.md`. |
| `frontend/` | Angular PWA, Vitest, ESLint, Prettier, Playwright. See `frontend/README.md`. |
| `docker/` | FrankenPHP `Caddyfile` (prod) and `Caddyfile.dev`, `php.ini`, db init scripts. |
| `compose.yaml` | Base stack: `web`, `worker`, `scheduler`, `db`. |
| `compose.override.yaml` | Local development (applied automatically). |
| `compose.prod.yaml` | Production: prebuilt image, one-shot `migrate`, restart policies. |
| `scripts/` | `check-pins.sh` and operational scripts. |
| `docs/ops/` | Operations guides (local HTTPS, maintenance). |

## Requirements

Docker with Compose v2. For running linters and tests on the host: PHP 8.5 with `pdo_pgsql`,
`intl`, `zip`, `bcmath`; Composer 2.10; Node 24 (or 22.22+); `jq`.

## Quickstart (local)

```bash
make env                 # .env from .env.example with a fresh APP_KEY
make install             # composer install + npm ci on the host
make up                  # build and start web, worker, scheduler, db and the Angular dev server
make user EMAIL=you@example.com NAME="You"
open https://localhost
```

`make up` waits until every service is healthy: `db` (`pg_isready`), the Angular dev server, the
one-shot `migrate` service and `web` (`/up`). Angular edits hot-reload through `https://localhost`
because Caddy proxies everything that is not `/api/*`, `/sanctum/*` or `/up` to `ng serve`.

If ports 80, 443 or 5432 are taken on the host, set `HTTP_PORT`, `HTTPS_PORT` and `DB_HOST_PORT` in
`.env`, include the HTTPS port in `APP_URL` and `SANCTUM_STATEFUL_DOMAINS` (for example
`localhost,localhost:8443`), and open `https://localhost:<HTTPS_PORT>`.

To use the app from a phone over the LAN or Tailscale, trust Caddy's local CA as described in
`docs/ops/local-https.md` (`make trust-ca` exports it).

## Everyday commands

| Command | What it does |
|---|---|
| `make up` / `make down` | Start (and wait for healthy) / stop the dev stack; volumes are kept |
| `make logs` / `make ps` | Follow logs / list services |
| `make lint` | `check-pins.sh`, Pint, PHPStan (level 9), ESLint, Prettier |
| `make test` | Pest on PostgreSQL `finance_test` (needs `db` running) and Vitest |
| `make build` | Production `ng build` and `docker build --target runtime` |
| `make e2e` | Playwright journeys against the running stack (`E2E_BASE_URL`) |
| `make config` | Validates the dev and prod compose configurations |
| `make verify-ledger` | `php artisan app:ledger:verify` inside `web` |
| `make recurring [DATE=YYYY-MM-DD]` | Generate due recurring movements now (or as of `DATE`) inside `web`; idempotent |
| `make schedule` | `php artisan schedule:list` in Europe/Madrid (`app:drafts:purge` 03:30, `app:recurring:generate` 06:00) |

Xdebug is installed in the dev image and off by default; start it with `XDEBUG_MODE=debug make up`.

## Production

One image (`Dockerfile`, target `runtime`) runs `web`, `worker` and `scheduler`; only the command
differs. Secrets come from `.env` on the server and are never baked into the image.

```bash
APP_IMAGE=ghcr.io/<owner>/personal-finance:<tag>   # in .env, together with APP_KEY, SERVER_NAME, DB_*
docker compose -f compose.yaml -f compose.prod.yaml up -d --wait
```

The `migrate` service runs `php artisan migrate --force` once; `web`, `worker` and `scheduler`
start only after it completes successfully. PostgreSQL publishes no port in production.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: `pins` (`scripts/check-pins.sh`),
`backend` (Pint, PHPStan, Pest on PostgreSQL 18), `frontend` (ESLint, Prettier, Vitest,
production build, service worker and manifest checks), `image` (runtime image build with GHA cache,
no push) and `e2e` (prod compose stack with the freshly built image, Playwright on Chromium and
WebKit).

## Version pinning

Every dependency and image is pinned exactly (`docs/plan/DECISIONS.md` ADR-027). `package.json` uses
exact versions (`.npmrc` `save-exact=true`), lock files are committed, Docker tags and GitHub
Actions are exact versions. `scripts/check-pins.sh` enforces it in CI.

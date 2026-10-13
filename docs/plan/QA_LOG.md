# QA log

Per-milestone QA results, manual device checks and performance numbers (see
`IMPLEMENTATION_PLAN.md` section 3). Newest entries at the bottom of each milestone.

## Pending manual items

| Item | Milestone | Status |
|---|---|---|
| Trust Caddy's local root CA on an iPhone and open the app over LAN/Tailscale (`docs/ops/local-https.md`) | M0 | pending |
| Install the PWA on iPhone (Safari, Add to Home Screen) and Android (Chrome) | M0 | pending |
| First CI run on GitHub (all five jobs green, GHA cache warm for `e2e`) | M0 | pending |

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

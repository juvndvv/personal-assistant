# Security

Threat model: one owner, personal financial data and receipts, a small server. The main risks are
credential guessing if the app is exposed, a stolen or lost server or backup, and leaked API keys.
Decisions are in `docs/plan/DECISIONS.md` (ADR-022 authentication, ADR-031 backups, ADR-032 security
posture).

## Exposure

- Preferred: reachable only over Tailscale (`docs/ops/deploy.md`). Nothing listens on the public
  internet.
- If exposed publicly: a single user created with `app:create-user`, no registration route, and the
  limits below. An authenticating reverse proxy in front is recommended.

## HTTPS and headers

Production `docker/frankenphp/Caddyfile` (the dev `Caddyfile.dev` sends none of these, so HSTS never
sticks to development hosts):

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `same-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(self)` |
| `X-Frame-Options` | `DENY` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`Server` and `X-Powered-By` are removed. Plain HTTP answers `308` to HTTPS (Caddy automatic HTTPS).
Scripts are strictly same-origin: the Angular build has no inline scripts or handlers
(`frontend/scripts/check-build.mjs` fails the build otherwise). `style-src` keeps `'unsafe-inline'`
because Angular injects component styles at runtime. Verify on a running stack:

```bash
curl -sI https://<host>/login
```

CI (`e2e` job) asserts every header and the redirect against the production overlay, and the
Playwright `m8-hardening` journey checks that no page triggers a CSP violation.

## Authentication and abuse limits

| Control | Limit | Response |
|---|---|---|
| Login throttle (email + IP) | 5 attempts per minute | `429` with `Retry-After` |
| IP lockout | 10 failed logins from one IP in 15 min | `403 {"code":"ip_blocked"}` on `/api/v1/auth/*` for 60 min |
| API rate limit (per user) | 120 requests per minute on `/api/v1` | `429` |
| Capture / export | 60 captures per hour / 6 exports per minute | `429` |

Failed logins (`auth.failed`) and lockouts (`auth.lockout`) are logged as warnings to stderr; read
them with `docker compose ... logs web | grep auth.`. Behind a reverse proxy set `TRUSTED_PROXIES`
to the proxy's exact address (never a subnet or `*`, see `deploy.md`), otherwise every client shares
the proxy's IP and one attacker locks you out too.

Sessions: Sanctum SPA cookies, `Secure`, `HttpOnly`, `SameSite=Lax`, regenerated on login, remember
token cleared on logout, 30-day lifetime. CSRF via `XSRF-TOKEN`.

To unblock yourself early: `docker compose -f compose.yaml -f compose.prod.yaml exec web php artisan cache:clear`.

## Secrets

- `.env` (app, chmod 600) and `.env.backup` (rclone credentials, chmod 600) live only on the server,
  are gitignored and excluded from the Docker build context.
- Images are configured only through environment variables. `scripts/check-image-secrets.sh` runs in
  CI (`image` job) and before every release push; it fails on secret-looking env values, build
  arguments or commands in the layer history, files such as `.env`, keys or `rclone.conf`, and
  OpenAI, Anthropic, GitHub, AWS, age or `APP_KEY` patterns inside the application files.
- Local tool caches can capture environment values (PHPStan's container cache under
  `backend/storage/framework/cache` did); that directory is excluded from the build context.
- The age **private** key for backups is never on the server. Losing it makes every backup
  unreadable; store it in a password manager and offline.
- Rotate `OPENAI_API_KEY` in the provider console if it might have leaked, update `.env`, and
  `docker compose -f compose.yaml -f compose.prod.yaml up -d` to recreate the app containers.
- Changing `APP_KEY` logs you out and invalidates encrypted values; keep a copy with the backup key.

## Data at rest

- PostgreSQL data and receipts live in Docker volumes on the host; use full-disk encryption on the
  VPS or NAS where available.
- Backups are encrypted with age before they leave the container and are useless without the
  private key (`docs/ops/backup-restore.md`).
- Receipts are served only to the authenticated user; there is no public storage link.

## Supply chain

Exact versions everywhere (ADR-027, `scripts/check-pins.sh`), checksum-verified binaries in the
backup image, Dependabot monthly PRs (`.github/dependabot.yml`), and immutable release tags.

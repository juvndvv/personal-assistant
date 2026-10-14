# Deploying to production

Production is a single host (a small VPS or a NAS with Docker; no GPU needed because AI runs on
OpenAI) running `compose.yaml` + `compose.prod.yaml`: `web` (FrankenPHP, HTTPS), `worker`,
`scheduler`, `db` (PostgreSQL 18, no published port), the one-shot `migrate` service and `backup`.
Images are built by CI and pulled from GHCR; nothing is built on the server (ADR-030).

## 1. Choose how the app is reached

### Recommended: Tailscale only

The app is never exposed to the internet. Install Tailscale on the host and on your phone and
computer, enable MagicDNS, and use the host's tailnet name:

```dotenv
SERVER_NAME=finanzas.tail1234.ts.net
APP_URL=https://finanzas.tail1234.ts.net
SANCTUM_STATEFUL_DOMAINS=finanzas.tail1234.ts.net
CADDY_SERVER_EXTRA_DIRECTIVES=tls internal
HTTP_PORT=80
HTTPS_PORT=443
```

With `tls internal` Caddy issues the certificate from its own CA; trust it once on every device as
described in `docs/ops/local-https.md`. Because production sends HSTS, browsers will not let you
click through a certificate warning, so trust the CA before the first visit. Restrict the host
firewall so ports 80/443 are only reachable on the `tailscale0` interface (or bind them with
`HTTP_PORT=100.x.y.z:80`, `HTTPS_PORT=100.x.y.z:443` using the host's tailnet IP).

### Alternative: public hostname

Point a DNS name at the host and open ports 80 and 443. Leave `CADDY_SERVER_EXTRA_DIRECTIVES`
empty and Caddy obtains a Let's Encrypt certificate automatically:

```dotenv
SERVER_NAME=finanzas.example.com
APP_URL=https://finanzas.example.com
SANCTUM_STATEFUL_DOMAINS=finanzas.example.com
```

The app then relies on its own defences (login rate limit 5/min, IP lockout after 10 failures in
15 min for 60 min, API limit 120/min, single user, no registration). For an extra layer, put it
behind an authenticating reverse proxy (Cloudflare Access, Authelia, Authentik, or basic auth in an
outer Caddy). If a proxy terminates TLS or forwards requests:

- set `TRUSTED_PROXIES` to the exact address the proxy connects from (for example `172.18.0.10/32`,
  with the proxy container given a fixed `ipv4_address`) so the IP lockout and rate limits see the
  real client address. Never trust `*` or a whole Docker bridge subnet such as `172.18.0.0/16`:
  requests that reach the app through Docker's port forwarding (IPv6 clients, hairpin traffic)
  arrive from the bridge gateway, which sits inside that subnet, and their client-supplied
  `X-Forwarded-For` would be trusted, letting an attacker rotate addresses past the lockout;
- stop publishing 80/443 on the `web` container (`ports: !reset []` under `web` in a compose
  override) so the proxy is the only way in;
- keep HTTPS end to end or make sure the proxy sends `X-Forwarded-Proto: https`;
- if the proxy already sets security headers, make sure it does not weaken them.

## 2. Prepare the host

```bash
git clone https://github.com/<owner>/<repo>.git finanzas && cd finanzas
git checkout v1.0.0                       # the tag you deploy: compose files and scripts match the image
cp .env.example .env && chmod 600 .env
echo "<a read:packages token>" | docker login ghcr.io -u <github user> --password-stdin   # private packages only
```

## 3. `.env` checklist

| Key | Value |
|---|---|
| `APP_IMAGE` | `ghcr.io/<owner>/personal-finance:<tag>` (lowercase owner); `deploy.sh` updates the tag |
| `BACKUP_IMAGE` | `ghcr.io/<owner>/personal-finance-backup:<tag>`; `deploy.sh` updates the tag |
| `APP_KEY` | `base64:` + `openssl rand -base64 32`; keep a copy in your password manager |
| `APP_URL`, `SERVER_NAME`, `SANCTUM_STATEFUL_DOMAINS` | the hostname(s) from step 1 |
| `CADDY_SERVER_EXTRA_DIRECTIVES` | `tls internal` for Tailscale-only, empty for a public hostname |
| `DB_PASSWORD` | `openssl rand -hex 24`; `DB_DATABASE`/`DB_USERNAME` can stay `finance` |
| `OPENAI_API_KEY`, `AI_*` | see `docs/ops/ai-providers.md`; model names only here, never in code |
| `TRUSTED_PROXIES` | empty unless a reverse proxy sits in front; then only its exact address (`/32`), never a subnet or `*` |
| `BACKUP_AGE_RECIPIENT` | the `age1...` public key; the private key stays off the server |
| `BACKUP_REMOTE` | rclone destination, credentials in `.env.backup` (see `docs/ops/backup-restore.md`) |
| `HTTP_PORT`, `HTTPS_PORT` | `80`/`443` (or tailnet-IP bindings) |
| `DB_HOST_PORT`, `XDEBUG_MODE`, `APP_UID`, `APP_GID` | development only, ignored in production |

The app containers receive only the variables listed in `compose.yaml`; `.env.backup` reaches only
the `backup` container. Neither file is ever copied into an image (`.dockerignore`, and the release
workflow fails if an image contains secret-looking env, history or files).

## 4. First run

```bash
scripts/deploy.sh v1.0.0
docker compose -f compose.yaml -f compose.prod.yaml exec web php artisan app:create-user you@example.com --name="You" --with-defaults
make backup-now
```

`app:create-user` prompts for the password (hidden) and refuses to create a second user;
`--with-defaults` seeds the Spanish category tree. Open `APP_URL`, log in, create your accounts with
their opening balances, and install the PWA from the browser menu.

## 5. Releasing and deploying a new version

1. Merge to `main` with CI green.
2. Tag and push: `git tag v1.1.0 && git push origin v1.1.0`. `.github/workflows/release.yml`
   validates the tag, refuses to overwrite an existing one (tags are immutable, there is no
   `latest`), builds the app and backup images, fails if they contain secrets, and pushes
   `ghcr.io/<owner>/personal-finance:v1.1.0` and `ghcr.io/<owner>/personal-finance-backup:v1.1.0`.
   Set the repository variable `RELEASE_PLATFORMS=linux/amd64,linux/arm64` for an ARM NAS.
3. On the server:

   ```bash
   git fetch --tags && git checkout v1.1.0
   scripts/deploy.sh v1.1.0
   ```

`deploy.sh` pulls both images, pins them in `.env`, runs `docker compose up -d --wait` (the
`migrate` service runs `php artisan migrate --force` once and `web`, `worker` and `scheduler` start
only after it succeeds), checks the migrate exit code and `/up`, and with `DEPLOY_SMOKE_URL` also
checks the public URL and its HSTS header:

```bash
DEPLOY_SMOKE_URL=https://finanzas.tail1234.ts.net/up DEPLOY_SMOKE_INSECURE=1 scripts/deploy.sh v1.1.0
```

### Rollback

`scripts/deploy.sh <previous tag>` (the script prints it). Migrations are not rolled back. If a
release ran a destructive migration, restore the last backup taken before it
(`docs/ops/backup-restore.md`), which is why `make backup-now` before risky upgrades is good habit.

## Day-to-day

| Task | Command |
|---|---|
| Status and health | `docker compose -f compose.yaml -f compose.prod.yaml ps` |
| Logs | `docker compose -f compose.yaml -f compose.prod.yaml logs -f --tail=100 web worker scheduler backup` |
| Ledger check | `docker compose -f compose.yaml -f compose.prod.yaml exec web php artisan app:ledger:verify` |
| Backup now | `make backup-now` |
| Scheduled tasks | `docker compose -f compose.yaml -f compose.prod.yaml exec scheduler php artisan schedule:list --timezone=Europe/Madrid` |

Security notes are in `docs/ops/security.md`, the monthly routine in `docs/ops/maintenance.md`.

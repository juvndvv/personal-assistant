# Maintenance

A short monthly routine keeps the app secure without surprises. Every version is pinned
(ADR-027), so nothing changes until you change it.

## Monthly checklist

1. **Health.** `docker compose -f compose.yaml -f compose.prod.yaml ps`: every service healthy,
   `backup` included. Check that the newest files on the remote are from today:
   `docker compose -f compose.yaml -f compose.prod.yaml exec backup sh -c 'rclone lsl "$BACKUP_REMOTE"' | sort -k2,3 | tail -3`.
2. **Restore drill.** Confirm the monthly `Restore drill` workflow is green. Every few months run a
   real one from the production remote on your computer (`docs/ops/backup-restore.md`) and add a
   line to `docs/plan/QA_LOG.md`.
3. **Dependabot.** Review the monthly PRs (Composer, npm, Dockerfiles, compose files, GitHub
   Actions). Merge when CI is green; group related bumps.
4. **Things Dependabot does not cover**, checked by hand:

   ```bash
   cd backend && composer outdated --direct --strict
   cd frontend && npm outdated
   gh release list -R FiloSottile/age -L 1        # docker/backup/Dockerfile AGE_VERSION
   gh release list -R rclone/rclone -L 1          # RCLONE_VERSION
   gh release list -R aptible/supercronic -L 1    # SUPERCRONIC_VERSION
   ```

   - Base images: `dunglas/frankenphp:<frankenphp>-php<php>-alpine`, `composer`, `node` (LTS
     line), `postgres:18.x-alpine`. Update the tag in `Dockerfile`, `docker/backup/Dockerfile`,
     `compose.yaml`, `compose.override.yaml` and `.github/workflows/ci.yml` (the CI postgres service)
     together, and the table in `docs/plan/DECISIONS.md` ADR-027.
   - Backup tools: update the version **and** both `*_SHA256_*` build arguments in
     `docker/backup/Dockerfile` (compute them with `shasum -a 256` on the downloaded release assets;
     rclone publishes `SHA256SUMS`).
   - `laravel/ai` and Angular minor versions: read the changelog first; both move fast.
5. **Release.** If anything changed: `make lint test build`, `scripts/check-pins.sh`, tag a new
   version and `scripts/deploy.sh <tag>` (`docs/ops/deploy.md`).
6. **Logs.** Skim `docker compose ... logs --since 720h web | grep -E 'auth\.(failed|lockout)'` for
   unexpected login attempts.
7. **Host.** OS security updates, Docker Engine updates, free disk space for the `backups` and
   `pgdata` volumes (`docker system df -v`).

## PostgreSQL patch updates (18.x)

Minor versions are drop-in. Change `postgres:18.x-alpine` everywhere listed above (the backup image
must use the same tag so `pg_dump` matches), release, deploy. The data directory is reused.

## PostgreSQL 19 upgrade

Stay on 18 until **19.1** is generally available (the first patch release of a new major) and
the images used here support it. Then choose one path; in both, take `make backup-now` first and
keep the 18 volume until the upgrade is verified.

### Path A: dump and restore (recommended, simplest)

The backup format already is a `pg_dump -Fc` archive, so the restore tooling does the work:

1. Bump `postgres:18.6-alpine` to `postgres:19.x-alpine` in `compose.yaml`, `docker/backup/Dockerfile`
   and CI; run the full CI (Pest runs against 19) and fix anything that breaks. Release a tag.
2. Rehearse: `scripts/restore.sh --identity ... --source ... --app-image <new tag image>` restores an
   18 dump into a scratch 19 stack and runs `app:ledger:verify`. `pg_restore` 19 reads 18 archives.
3. On the server: `make backup-now`, then stop the stack
   (`docker compose -f compose.yaml -f compose.prod.yaml down`, without `-v`) and keep a copy of the
   18 data volume:

   ```bash
   docker volume create personal-finance_pgdata18
   docker run --rm --entrypoint "" -v personal-finance_pgdata:/from:ro -v personal-finance_pgdata18:/to \
     postgres:18.6-alpine cp -a /from/. /to/
   ```

4. Restore the backup you just took into the production project (this deletes the old volumes,
   which is why the copy above exists) and start the new release:

   ```bash
   scripts/restore.sh --identity ... --source ... --project personal-finance --env-file .env \
     --app-image ghcr.io/<owner>/personal-finance:<new tag> --replace
   scripts/deploy.sh <new tag>
   ```

5. After a week without issues, `docker volume rm personal-finance_pgdata18`.

### Path B: `pg_upgrade`

Faster for large databases (not the case here). Run the official `pg_upgrade` procedure with both
binaries available (for example the community `pgautoupgrade` image or a one-off container with 18
and 19 installed) against a copy of the `pgdata` volume, then point the stack at the upgraded
volume. Because the `postgres` image stores data under `/var/lib/postgresql/<major>/docker`, the
new major uses a new subdirectory in the same volume; verify the layout before switching. Run
`app:ledger:verify` and a fresh backup afterwards.

## Changing retention or schedule

`BACKUP_RETENTION_DAYS`, `BACKUP_SCHEDULE` and `BACKUP_STALE_AFTER_HOURS` in `.env`, then
`docker compose -f compose.yaml -f compose.prod.yaml up -d backup`. Keep the stale threshold a couple
of hours above the schedule interval.

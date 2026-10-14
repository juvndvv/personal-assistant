# Backups and restore

Production runs a `backup` service (`docker/backup/Dockerfile`, ADR-031). It is built
`FROM postgres:18.6-alpine`, so `pg_dump` always matches the server major, and adds pinned,
checksum-verified `age` 1.3.2, `rclone` 1.75.2 and `supercronic` 0.2.49.

## What it does

Every day at 03:00 Europe/Madrid (`BACKUP_SCHEDULE`, cron syntax) `backup-run`:

1. counts the rows of every table (except cache, sessions and queue tables);
2. streams `pg_dump --format=custom` straight into `age`, so no plaintext dump touches the disk;
3. streams a `tar.gz` of the `appstorage` volume (receipts in `private/receipts`, mounted read-only)
   into `age`;
4. writes an encrypted manifest with the sha256 of both archives, the row counts and the number of
   storage files;
5. uploads the three files to `BACKUP_REMOTE` with `rclone`;
6. deletes copies older than `BACKUP_RETENTION_DAYS` (30) from the local `backups` volume and from
   the remote (`rclone delete --min-age 30d`);
7. writes the heartbeat `/backups/.last-success`.

Files are named `pf-YYYYmmddTHHMMSS-{db.dump,storage.tar.gz,manifest.txt}.age`.

The container healthcheck (`backup-healthcheck`, every 5 minutes) turns **unhealthy** when the last
success is older than `BACKUP_STALE_AFTER_HOURS` (26 h). Before the first success it measures from
the moment the volume was initialised, so a stack that never manages to back up also turns
unhealthy after 26 h. Check it with `docker compose -f compose.yaml -f compose.prod.yaml ps backup`.

## Keys: the private key never lives on the server

Backups are encrypted to an [age](https://age-encryption.org) public key. Generate the key pair on
your own computer, not on the server:

```bash
docker run --rm --entrypoint age-keygen ghcr.io/<owner>/personal-finance-backup:<tag> > finanzas-backup.agekey
docker run --rm -i --entrypoint age-keygen ghcr.io/<owner>/personal-finance-backup:<tag> -y < finanzas-backup.agekey
# age1...   <- the public recipient
```

- Put only the `age1...` recipient in the server `.env` as `BACKUP_AGE_RECIPIENT`. Several
  recipients can be given separated by commas (for example a second key kept in a safe).
- Store `finanzas-backup.agekey` in your password manager and on an offline medium. Without it the
  backups cannot be read by anyone, including you.
- The entrypoint refuses to start if `BACKUP_AGE_RECIPIENT` is missing, invalid, or looks like a
  private key.

## Off-site remote

`BACKUP_REMOTE` is any `rclone` destination path, for example `b2:my-bucket/finanzas`,
`s3:my-bucket/finanzas`, `nas-sftp:/volume1/backups/finanzas` or `webdav:finanzas`. Remote
credentials go in `.env.backup` next to `.env` (gitignored, loaded only by the `backup` service,
never by the app containers), using rclone's environment configuration:

```dotenv
# .env.backup, chmod 600
RCLONE_CONFIG_B2_TYPE=b2
RCLONE_CONFIG_B2_ACCOUNT=<key id>
RCLONE_CONFIG_B2_KEY=<application key>
RCLONE_CONFIG_B2_HARD_DELETE=true
```

```dotenv
# .env
BACKUP_REMOTE=b2:my-bucket/finanzas
```

Use a bucket or folder dedicated to these backups and, where the provider allows it, credentials
restricted to it. Lifecycle rules on the bucket that keep old versions forever defeat the 30-day
retention; set `HARD_DELETE` (B2) or an equivalent lifecycle rule. Test the remote once with
`docker compose -f compose.yaml -f compose.prod.yaml exec backup sh -c 'rclone lsf "$BACKUP_REMOTE"'`.

## Run a backup now

```bash
make backup-now      # docker compose -f compose.yaml -f compose.prod.yaml exec backup backup-run
```

Do it after the first deploy and before risky upgrades (PostgreSQL major, destructive migrations).

## Restore

`scripts/restore.sh` runs on any machine with Docker and this repository. It needs the private key,
so run it on your computer (or bring the key to the server only for the duration of a disaster
recovery). It fetches, verifies, decrypts and restores into a compose project, then checks:

- the sha256 of both archives against the encrypted manifest;
- the row count of every table against the manifest;
- the number of storage files against the manifest;
- the sha256 of every receipt referenced by `attachments`;
- `php artisan migrate --force` and `php artisan app:ledger:verify`.

### Drill into a scratch stack (default)

```bash
scripts/restore.sh --identity ~/secrets/finanzas-backup.agekey --source b2:my-bucket/finanzas \
  --app-image ghcr.io/<owner>/personal-finance:<tag>
```

It restores the newest backup (or `--backup pf-YYYYmmddTHHMMSS`) into the project
`pf-restore-drill` with a scratch `.env` (fresh `APP_KEY` and database password, no published ports),
verifies it and deletes the scratch stack and the decrypted files. `--rclone-env FILE` points at
the remote credentials (default `.env.backup`); `--source` may also be a local directory holding the
`.age` files. Add `--keep` to leave the stack running for inspection.

`make restore-drill` runs the whole cycle on scratch stacks with throwaway keys: seed, back up,
prove the archives are unreadable without the key, retention pruning, stale healthcheck, restore
and verify. `.github/workflows/restore-drill.yml` runs the same script on the 1st of every month and
on demand. Record manual drills in `docs/plan/QA_LOG.md`.

### Disaster recovery on a new server

1. Install Docker, clone the repository at the release tag you run, recreate `.env` (the **same**
   `APP_KEY` as before, from your password manager, so encrypted values and sessions stay valid)
   and `.env.backup`.
2. Restore into the production project name, which must not have volumes yet:

   ```bash
   scripts/restore.sh --identity finanzas-backup.agekey --source b2:my-bucket/finanzas \
     --project personal-finance --env-file .env --app-image ghcr.io/<owner>/personal-finance:<tag>
   ```

   With `--project` the stack is kept. If the project already has volumes the script stops; pass
   `--replace` only when you really want to delete them.
3. `scripts/deploy.sh <tag>` starts the full production stack on the restored volumes.
4. Remove the private key from the server and run `make backup-now`.

Restoring over a running production stack is intentionally not automated: stop it first
(`docker compose -f compose.yaml -f compose.prod.yaml down`, without `-v`), take a fresh backup if
the database is still readable, then follow step 2 with `--replace`.

## Configuration reference

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `BACKUP_IMAGE` | `.env` | `personal-finance-backup:local` | Image of the `backup` service; `deploy.sh` pins it to the release tag |
| `BACKUP_AGE_RECIPIENT` | `.env` | required | age public key(s), comma separated |
| `BACKUP_REMOTE` | `.env` | required | rclone destination path |
| `BACKUP_SCHEDULE` | `.env` | `0 3 * * *` | cron expression in Europe/Madrid |
| `BACKUP_RETENTION_DAYS` | `.env` | `30` | local and remote retention |
| `BACKUP_STALE_AFTER_HOURS` | `.env` | `26` | healthcheck threshold |
| `RCLONE_CONFIG_*` | `.env.backup` | | remote definition and credentials |

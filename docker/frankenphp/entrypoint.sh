#!/bin/sh
set -eu

receipts_dir=/app/storage/app/private/receipts

mkdir -p "$receipts_dir" 2>/dev/null || true
if [ ! -w "$receipts_dir" ]; then
	echo "app-entrypoint: $receipts_dir is not writable by uid $(id -u); fix the appstorage volume ownership (chown -R $(id -u):$(id -g) storage/app)" >&2
	exit 1
fi

if [ "${APP_ENV:-production}" = "production" ]; then
	php artisan optimize --no-interaction --quiet
fi

exec docker-php-entrypoint "$@"

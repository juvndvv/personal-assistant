#!/bin/sh
set -eu

if [ "${APP_ENV:-production}" = "production" ]; then
	php artisan optimize --no-interaction --quiet
fi

exec docker-php-entrypoint "$@"

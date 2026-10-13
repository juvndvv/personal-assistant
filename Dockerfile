FROM node:24.21.0-alpine AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build


FROM composer:2.10.3 AS vendor
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --no-scripts --no-autoloader --prefer-dist --ignore-platform-req='ext-*'
COPY backend/ ./
RUN composer dump-autoload --no-dev --optimize --no-scripts


FROM dunglas/frankenphp:1.13.0-php8.5.11-alpine AS runtime
ARG APP_UID=1000
ARG APP_GID=1000
ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    SERVER_NAME=localhost
RUN install-php-extensions pdo_pgsql intl zip bcmath opcache pcntl \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && addgroup -g "${APP_GID}" app \
    && adduser -D -u "${APP_UID}" -G app app \
    && setcap CAP_NET_BIND_SERVICE=+eip /usr/local/bin/frankenphp \
    && mkdir -p /data/caddy /config/caddy \
    && chown -R app:app /data /config
COPY docker/frankenphp/php.ini "$PHP_INI_DIR/conf.d/zz-app.ini"
COPY docker/frankenphp/Caddyfile /etc/frankenphp/Caddyfile
COPY --chmod=755 docker/frankenphp/entrypoint.sh /usr/local/bin/app-entrypoint
WORKDIR /app
COPY --chown=app:app --from=vendor /app /app
COPY --chown=app:app --from=frontend-build /src/dist/frontend/browser /app/public/app
USER app
RUN mkdir -p storage/app/private/receipts storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && php artisan package:discover --ansi
EXPOSE 80 443 443/udp
ENTRYPOINT ["app-entrypoint"]
CMD ["frankenphp", "run", "--config", "/etc/frankenphp/Caddyfile"]


FROM runtime AS dev
ENV APP_ENV=local \
    APP_DEBUG=true \
    OPCACHE_VALIDATE_TIMESTAMPS=1 \
    XDEBUG_MODE=off
USER root
RUN install-php-extensions xdebug-3.5.3 \
    && cp "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"
COPY docker/frankenphp/xdebug.ini "$PHP_INI_DIR/conf.d/zz-xdebug.ini"
COPY docker/frankenphp/Caddyfile.dev /etc/frankenphp/Caddyfile
COPY --from=composer:2.10.3 /usr/bin/composer /usr/local/bin/composer
USER app
RUN composer install --no-interaction --no-progress --prefer-dist

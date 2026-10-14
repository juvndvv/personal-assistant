FROM postgres:18.6-alpine

ARG TARGETARCH
ARG AGE_VERSION=1.3.2
ARG AGE_SHA256_AMD64=cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10
ARG AGE_SHA256_ARM64=6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4
ARG RCLONE_VERSION=1.75.2
ARG RCLONE_SHA256_AMD64=349ac8fba6ff65d6247043f1750cdcb518ec5d500ef91463a10d37c0ccdf3702
ARG RCLONE_SHA256_ARM64=7e1e8d69654941b7b7df84ee74c5f7fb09cce7d5496947fb7bf16b55ff427d10
ARG SUPERCRONIC_VERSION=0.2.49
ARG SUPERCRONIC_SHA256_AMD64=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1
ARG SUPERCRONIC_SHA256_ARM64=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5

ENV TZ=Europe/Madrid \
    BACKUP_DIR=/backups \
    BACKUP_SOURCE_STORAGE=/data/appstorage \
    BACKUP_SCHEDULE="0 3 * * *" \
    BACKUP_RETENTION_DAYS=30 \
    BACKUP_STALE_AFTER_HOURS=26

RUN set -eu; \
    apk add --no-cache ca-certificates tzdata; \
    case "${TARGETARCH:-amd64}" in \
      amd64) age_sha="$AGE_SHA256_AMD64"; rclone_sha="$RCLONE_SHA256_AMD64"; supercronic_sha="$SUPERCRONIC_SHA256_AMD64" ;; \
      arm64) age_sha="$AGE_SHA256_ARM64"; rclone_sha="$RCLONE_SHA256_ARM64"; supercronic_sha="$SUPERCRONIC_SHA256_ARM64" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    arch="${TARGETARCH:-amd64}"; \
    work="$(mktemp -d)"; \
    cd "$work"; \
    wget -q -O age.tar.gz "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-${arch}.tar.gz"; \
    echo "${age_sha}  age.tar.gz" | sha256sum -c -; \
    tar -xzf age.tar.gz; \
    install -m 0755 age/age age/age-keygen /usr/local/bin/; \
    wget -q -O rclone.zip "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-${arch}.zip"; \
    echo "${rclone_sha}  rclone.zip" | sha256sum -c -; \
    unzip -q rclone.zip; \
    install -m 0755 "rclone-v${RCLONE_VERSION}-linux-${arch}/rclone" /usr/local/bin/rclone; \
    wget -q -O supercronic "https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${arch}"; \
    echo "${supercronic_sha}  supercronic" | sha256sum -c -; \
    install -m 0755 supercronic /usr/local/bin/supercronic; \
    cd /; \
    rm -rf "$work"; \
    age --version; rclone version | head -n 1; supercronic -version 2>/dev/null || true; \
    mkdir -p "$BACKUP_DIR" "$BACKUP_SOURCE_STORAGE"

COPY --chmod=644 backup-common.sh /usr/local/lib/backup/backup-common.sh
COPY --chmod=755 backup-run.sh /usr/local/bin/backup-run
COPY --chmod=755 backup-healthcheck.sh /usr/local/bin/backup-healthcheck
COPY --chmod=755 backup-entrypoint.sh /usr/local/bin/backup-entrypoint

VOLUME ["/backups"]
WORKDIR /backups
HEALTHCHECK --interval=5m --timeout=10s --start-period=30s --retries=1 CMD ["backup-healthcheck"]
ENTRYPOINT ["backup-entrypoint"]
CMD ["supercronic", "-passthrough-logs", "/etc/backup/crontab"]

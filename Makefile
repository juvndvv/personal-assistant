SHELL := /bin/bash
.DEFAULT_GOAL := help

-include .env

HTTPS_PORT ?= 443
DB_HOST_PORT ?= 5432
DB_USERNAME ?= finance
DB_PASSWORD ?= finance
E2E_BASE_URL ?= https://localhost$(if $(filter 443,$(HTTPS_PORT)),,:$(HTTPS_PORT))
RUNTIME_IMAGE ?= personal-finance:local
BACKUP_RUNTIME_IMAGE ?= personal-finance-backup:local
PLACEHOLDER_AGE_RECIPIENT := age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq
EMAIL ?=
NAME ?=
DATE ?=
PERF_DB ?= finance_perf
E2E_API_RATE_LIMIT_PER_MINUTE ?= 100000

COMPOSE := docker compose
COMPOSE_PROD := docker compose -f compose.yaml -f compose.prod.yaml
BACKEND_TEST_ENV := DB_HOST=127.0.0.1 DB_PORT=$(DB_HOST_PORT) DB_USERNAME=$(DB_USERNAME) DB_PASSWORD=$(DB_PASSWORD)

.PHONY: help env install up down logs ps config lint lint-pins lint-backend lint-frontend \
	test test-backend test-frontend build build-frontend build-image build-backup-image image-secrets smoke e2e e2e-stack user \
	trust-ca verify-ledger recurring schedule perf backup-now restore restore-drill deploy capture-latency

help:
	@grep -hE '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

env: ## Create .env from .env.example with a fresh APP_KEY
	@test -f .env && echo ".env already exists" || \
		sed "s#^APP_KEY=.*#APP_KEY=base64:$$(openssl rand -base64 32)#" .env.example > .env

install: ## Install backend and frontend dependencies on the host
	cd backend && composer install
	cd frontend && npm ci

up: ## Start the dev stack and wait until it is healthy
	$(COMPOSE) up -d --build --wait

down: ## Stop the dev stack (volumes are kept)
	$(COMPOSE) down

logs: ## Follow the logs of every service
	$(COMPOSE) logs -f --tail=100

ps: ## Show service status
	$(COMPOSE) ps -a

PROD_CONFIG_ENV = APP_IMAGE=$(or $(APP_IMAGE),$(RUNTIME_IMAGE)) \
	BACKUP_AGE_RECIPIENT=$(or $(BACKUP_AGE_RECIPIENT),$(PLACEHOLDER_AGE_RECIPIENT)) \
	BACKUP_REMOTE=$(or $(BACKUP_REMOTE),/backups/offsite)

config: ## Validate the dev and prod compose configurations
	$(COMPOSE) config --quiet
	$(PROD_CONFIG_ENV) $(COMPOSE_PROD) config --quiet
	scripts/check-compose-env.sh
	$(PROD_CONFIG_ENV) scripts/check-compose-env.sh -f compose.yaml -f compose.prod.yaml

lint: lint-pins lint-backend lint-frontend ## Run every linter

lint-pins:
	scripts/check-pins.sh

lint-backend:
	cd backend && vendor/bin/pint --test
	cd backend && vendor/bin/phpstan analyse --memory-limit=1G --no-progress

lint-frontend:
	cd frontend && npm run lint
	cd frontend && npx prettier --check .

test: test-backend test-frontend ## Run backend and frontend tests

test-backend: ## Pest on PostgreSQL finance_test (needs the db service)
	cd backend && $(BACKEND_TEST_ENV) php artisan test --parallel

perf: ## Seed 50k movements on a scratch DB, run Pest --group=perf, append results to QA_LOG.md
	$(BACKEND_TEST_ENV) PERF_DB=$(PERF_DB) scripts/perf.sh

test-frontend: ## Vitest in run mode
	cd frontend && npm test

build: build-frontend build-image build-backup-image ## Production Angular build, runtime and backup images

build-frontend:
	cd frontend && npm run build

build-image:
	docker build --target runtime -t $(RUNTIME_IMAGE) .

build-backup-image:
	docker build -t $(BACKUP_RUNTIME_IMAGE) docker/backup

image-secrets: ## Assert that the built images carry no secrets
	scripts/check-image-secrets.sh $(RUNTIME_IMAGE) $(BACKUP_RUNTIME_IMAGE)

smoke: ## Runtime smoke checks against the running stack (E2E_BASE_URL)
	E2E_BASE_URL=$(E2E_BASE_URL) scripts/smoke.sh

e2e-stack: ## Start the prod-like stack from RUNTIME_IMAGE for Playwright, with the API limit raised
	$(PROD_CONFIG_ENV) APP_IMAGE=$(RUNTIME_IMAGE) BACKUP_IMAGE=$(BACKUP_RUNTIME_IMAGE) API_RATE_LIMIT_PER_MINUTE=$(E2E_API_RATE_LIMIT_PER_MINUTE) \
		$(COMPOSE_PROD) up -d --wait --wait-timeout 180

e2e: ## Playwright journeys against the running stack (E2E_BASE_URL)
	cd frontend && E2E_BASE_URL=$(E2E_BASE_URL) npx playwright test

user: ## Create the single user: make user EMAIL=you@example.com NAME="You"
	@test -n "$(EMAIL)" || { echo "Usage: make user EMAIL=you@example.com [NAME=\"You\"]"; exit 1; }
	$(COMPOSE) exec web php artisan app:create-user "$(EMAIL)" $(if $(NAME),--name="$(NAME)")

trust-ca: ## Export Caddy's local root CA to .caddy/root.crt and trust it on macOS
	@mkdir -p .caddy
	$(COMPOSE) cp web:/data/caddy/pki/authorities/local/root.crt .caddy/root.crt
	@if [ "$$(uname)" = "Darwin" ]; then \
		security add-trusted-cert -r trustRoot -k "$$HOME/Library/Keychains/login.keychain-db" .caddy/root.crt; \
		echo "Trusted .caddy/root.crt in the login keychain"; \
	else \
		echo "Install .caddy/root.crt in your trust store (see docs/ops/local-https.md)"; \
	fi

recurring: ## Generate due recurring movements: make recurring [DATE=YYYY-MM-DD]
	$(COMPOSE) exec web php artisan app:recurring:generate $(if $(DATE),--date="$(DATE)")

schedule: ## List the scheduled tasks in Europe/Madrid time
	$(COMPOSE) exec scheduler php artisan schedule:list --timezone=Europe/Madrid

verify-ledger: ## Check ledger invariants (php artisan app:ledger:verify)
	$(COMPOSE) exec web php artisan app:ledger:verify

capture-latency: ## extraction_ms p50/p95 per capture kind from the production database
	$(COMPOSE_PROD) exec -T db sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "SELECT kind, count(*) AS captures, percentile_cont(0.5) WITHIN GROUP (ORDER BY extraction_ms) AS p50_ms, percentile_cont(0.95) WITHIN GROUP (ORDER BY extraction_ms) AS p95_ms FROM captures WHERE extraction_ms IS NOT NULL GROUP BY kind ORDER BY kind"'

backup-now: ## Run an encrypted off-site backup now on the production stack
	$(COMPOSE_PROD) exec backup backup-run

restore: ## Restore a backup into a scratch stack: make restore IDENTITY=key.txt SOURCE=remote:path [BACKUP=pf-...]
	@test -n "$(IDENTITY)" -a -n "$(SOURCE)" || { echo "Usage: make restore IDENTITY=path/to/age-identity.txt SOURCE=remote:path [BACKUP=pf-YYYYmmddTHHMMSS]"; exit 1; }
	scripts/restore.sh --identity "$(IDENTITY)" --source "$(SOURCE)" $(if $(BACKUP),--backup "$(BACKUP)") --app-image $(RUNTIME_IMAGE) --backup-image $(BACKUP_RUNTIME_IMAGE)

restore-drill: ## Full backup and restore drill on scratch stacks (needs make build-image build-backup-image)
	APP_IMAGE=$(RUNTIME_IMAGE) BACKUP_IMAGE=$(BACKUP_RUNTIME_IMAGE) scripts/restore-drill.sh

deploy: ## Deploy a release tag on the server: make deploy TAG=v1.2.3
	@test -n "$(TAG)" || { echo "Usage: make deploy TAG=v1.2.3"; exit 1; }
	scripts/deploy.sh "$(TAG)"

SHELL := /bin/bash
.DEFAULT_GOAL := help

-include .env

HTTPS_PORT ?= 443
DB_HOST_PORT ?= 5432
DB_USERNAME ?= finance
DB_PASSWORD ?= finance
E2E_BASE_URL ?= https://localhost$(if $(filter 443,$(HTTPS_PORT)),,:$(HTTPS_PORT))
RUNTIME_IMAGE ?= personal-finance:local
EMAIL ?=
NAME ?=
DATE ?=
PERF_DB ?= finance_perf

COMPOSE := docker compose
COMPOSE_PROD := docker compose -f compose.yaml -f compose.prod.yaml
BACKEND_TEST_ENV := DB_HOST=127.0.0.1 DB_PORT=$(DB_HOST_PORT) DB_USERNAME=$(DB_USERNAME) DB_PASSWORD=$(DB_PASSWORD)

.PHONY: help env install up down logs ps config lint lint-pins lint-backend lint-frontend \
	test test-backend test-frontend build build-frontend build-image smoke e2e user trust-ca verify-ledger \
	recurring schedule perf

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

config: ## Validate the dev and prod compose configurations
	$(COMPOSE) config --quiet
	APP_IMAGE=$(or $(APP_IMAGE),$(RUNTIME_IMAGE)) $(COMPOSE_PROD) config --quiet
	scripts/check-compose-env.sh
	APP_IMAGE=$(or $(APP_IMAGE),$(RUNTIME_IMAGE)) scripts/check-compose-env.sh -f compose.yaml -f compose.prod.yaml

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

build: build-frontend build-image ## Production Angular build and runtime image

build-frontend:
	cd frontend && npx ng build

build-image:
	docker build --target runtime -t $(RUNTIME_IMAGE) .

smoke: ## Runtime smoke checks against the running stack (E2E_BASE_URL)
	E2E_BASE_URL=$(E2E_BASE_URL) scripts/smoke.sh

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

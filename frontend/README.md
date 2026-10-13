# Finanzas frontend

Angular 22 PWA (standalone, zoneless, signals, `OnPush`) for the personal finance app. It is served
from the same origin as the Laravel API through FrankenPHP (see `docs/plan/DECISIONS.md` ADR-024 to
ADR-028).

## Commands

| Command                | What it does                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `npm ci`               | Install the exact locked dependencies                                                      |
| `npm start`            | `ng serve` on :4200 with `proxy.conf.json` (`/api`, `/sanctum`, `/up` → https://localhost) |
| `npm run lint`         | ESLint (`angular-eslint`)                                                                  |
| `npm run format:check` | Prettier check                                                                             |
| `npm test`             | Vitest unit and component tests (single run)                                               |
| `npm run build`        | Production build to `dist/frontend/browser` with the service worker                        |
| `npm run e2e`          | Playwright journeys against `E2E_BASE_URL` (default `https://localhost`)                   |
| `npm run icons`        | Regenerate PWA icons from `public/favicon.svg`                                             |

End-to-end runs need a user created with `php artisan app:create-user`. Credentials come from
`E2E_USER_EMAIL` and `E2E_USER_PASSWORD` (defaults `e2e@example.com` / `e2e-password-123`). Install
browsers once with `npx playwright install chromium webkit`. The login throttle allows 5 attempts per
minute per email and IP, so the Playwright global setup clears the backend cache with
`docker compose exec -T web php artisan cache:clear` from the repository root before each run, and the
wrong-credentials journey uses a throwaway email with its own throttle bucket. Set
`E2E_SKIP_STACK_RESET=1` when the target stack is not the local compose project.

## Layout

- `src/app/core`: API clients and models, HTTP interceptors (credentials, CSRF retry, 401 redirect),
  `AuthStore` and guards, money (`parseEuroToCents`, `eur` pipe) and date helpers, PWA services.
- `src/app/shared/ui`: own wrappers over yukit-web (`ui-button`, `ui-input`, `ui-money-input`,
  `ui-select`, `ui-date-input`, `ui-checkbox`, `ui-sheet`, `ui-dialog`, `ui-toast`,
  `ui-empty-state`, `ui-badge`). Feature code imports only these, never `yukit-web` directly.
- `src/app/features`: lazy feature routes. `features/dev` holds the kitchen sink, routed only in the
  `development` build configuration (`/dev/kitchen-sink`).
- `e2e`: Playwright journeys, one per milestone.

## Conventions

- Money is always integer cents; parse user input with `parseEuroToCents`, display with `| eur`.
- Dates are ISO `YYYY-MM-DD` strings in the Europe/Madrid calendar; use `core/date/iso-date.ts`.
- yukit-web 0.3.4 declares Angular 21 peers; `package.json` `overrides` pins them to Angular 22
  (ADR-026a). Keep every version exact (`.npmrc` `save-exact=true`).

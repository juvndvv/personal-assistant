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
| `npm run build`        | Production build to `dist/frontend/browser`, then `scripts/check-build.mjs` (postbuild)    |
| `npm run e2e`          | Playwright journeys against `E2E_BASE_URL` (default `https://localhost`)                   |
| `npm run icons`        | Regenerate PWA icons and iOS splash screens from `public/favicon.svg`                      |

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

## Production hardening (M8)

- CSP: the build must run under `script-src 'self'` with no exceptions. Critical CSS inlining is off
  (`optimization.styles.inlineCritical: false`) because it injects an inline `<script>` that toggles
  the stylesheet media. `autoCsp` is not enabled: Angular 22 still marks it experimental and it adds
  an inline loader script plus a hash-based `<meta>` policy that the server `Content-Security-Policy`
  header (ADR-032) would block. `scripts/check-build.mjs` fails the build on inline scripts, inline
  event handlers, `eval`/`new Function`, missing iOS meta or splash screens, and `/api` URLs in
  `ngsw.json`.
- PWA: `core/pwa/pwa-status-banner.ts` (in the root component, so it also shows on the login page)
  renders the offline banner and the "Nueva versión disponible" prompt. `AppUpdates` listens for
  `VERSION_READY` and `UNRECOVERABLE_STATE`, checks for updates when the app becomes visible again,
  and activates the new version before reloading. There is no offline mode.
- Accessibility: `src/styles.css` gives every control at least 44 × 44 px on coarse pointers and a
  solid focus outline; text on light surfaces uses `text-primary-text`, `text-success-text` and
  `text-info-text`, and the primary fill is one step darker than the brand coral so white labels
  reach 4.5:1. `e2e/m8-hardening.spec.ts` runs axe (WCAG 2.2 AA) and a 44 px tap-target check on
  every signed-in page; SVG chart marks are excluded from the tap-target check.
- Login shows friendly messages for 429 (throttled, uses `Retry-After`) and 403 `ip_blocked`;
  `AuthStore` treats a blocked IP on `/auth/me` as a guest so the login page can explain it.
- Set `E2E_EXPECT_SECURITY_HEADERS=1` when running Playwright against the production overlay to
  assert HSTS and the ADR-032 headers.

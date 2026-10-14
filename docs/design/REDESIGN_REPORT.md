# Redesign report: glass + neutral palette

Branch: `feat/glass-redesign`. Scope: `frontend/` only, with no backend or API changes. Source of truth: [REDESIGN_SPEC.md](./REDESIGN_SPEC.md). Implementation guide: [COMPONENTS.md](./COMPONENTS.md).

## 1. What changed

### Design system and tokens (`frontend/src/styles.css`)

- yukit's coral theme is replaced with the neutral ChatGPT palette for light and dark. `--gray-1..12` and `--primary-1..9` are remapped to the monotone ramp, so no coral is left. Spartan semantics (`--background`, `--card`, `--popover`, `--muted`, `--accent`, `--border`, `--ring`, `--primary`, `--sidebar*`, feedback colours) are overridden after the yukit import. Dark overrides are scoped so `:root` primitives can't leak into dark mode.
- New semantic layers are exposed as Tailwind theme tokens: grouped surface, fill strong, hover and pressed overlays, a four-step border scale, tertiary and disabled text, link, income, expense and transfer, badge tints, callout backgrounds, `--viz-series-*` / `--viz-track`, and twelve category palette keys with separate light and dark values.
- Glass tokens and utilities: `glass`, `glass-regular`, `glass-menu` and `glass-fill`, with specular highlight, hairline, edge and shadows. A fixed ambient `body::before` backdrop gives the glass something to blur. Fallbacks cover `@supports not (backdrop-filter)`, `html[data-transparency="reduced"]`, `prefers-reduced-transparency`, `prefers-contrast: more` and `prefers-reduced-motion`.
- Shape tokens: `rounded-capsule`, `rounded-card`, `rounded-menu`, `rounded-menu-item`, `rounded-sheet` and `rounded-sheet-floating`. Shadows use `shadow-card` (none in dark). Motion uses the `ease-spring` token.
- Type: system font stack (Geist removed), 17px body on mobile and 16px on desktop, nothing under 12px, and `.amount` (tabular, semibold).
- Hardcoded yukit literals are overridden: the `bg-black/10` scrims, the white slider thumb, `text-gray-600` pagination, the oklch bubble and the sidebar submenu gradient. The toaster now follows the resolved theme.

### Theme and PWA chrome

- `ThemeService`: Light / Dark / System plus "Reducir transparencia", stored in `localStorage` per device. It applies `.dark` and `data-transparency` on `<html>` and updates `theme-color` at runtime. `public/theme-init.js` (an external script, because the CSP forbids inline scripts) sets the class before Angular starts, so the theme does not flash.
- `index.html` has `viewport-fit=cover`, the `black-translucent` status bar and two media-scoped `theme-color` metas (`#ffffff` / `#212121`). The manifest's `theme_color` and `background_color` are `#ffffff`. Icons and the 18 iOS splash screens were regenerated in monochrome through `scripts/generate-icons.mjs`.
- Safe areas: the top bar uses `env(safe-area-inset-top)`, and every fixed bottom element uses `--shell-bottom-inset`. Main content padding is derived from bar heights, so the hardcoded `pb-28` / `bottom-24` values are gone.
- `app-boot-splash` (`core/boot/`) renders a themed shell skeleton while the auth guard resolves, so a cold start never shows a blank page.

### Shared components (`frontend/src/app/shared/ui/`)

- New components: `ui-card` / `[uiCard]`, `ui-alert` (with a retryable variant), `ui-skeleton` / `ui-skeleton-list`, `ui-glass-bar` (top and bottom), `ui-button-link` and `ui-switch`.
- Reworked components: `ui-sheet` (glass, 28px top radius, bottom sheet on mobile and right side from `md`), `ui-toast`, `ui-segmented` and `ui-tabs` (sliding indicator), `ui-select`, `ui-combobox`, `ui-date-input`, `ui-field`, `ui-money-input`, `ui-empty-state` and `ui-button` (capsule shape, monochrome primary).
- `page-header` gained an optional back link, which replaces the hand-rolled "← Más" links. The charts (`shared/charts`) use only `--viz-*` tokens. The category palette (`category-appearance.ts`) maps the 12 legacy hex values to palette keys in the frontend, with no data migration.

### Shell

- Mobile: a floating glass capsule tab bar inset 16px from the screen edges, with a sliding `glass-fill` indicator. The active tab is shown by icon weight and label, not colour alone. A centred "+" capsule opens quick-add. The grid uses `minmax(0,1fr)` columns so the indicator calculation stays exact.
- Desktop: a glass sidebar on the grouped background, a glass top bar with the page title and back navigation, and a wider content area.

### Screens by group

| Group | Changes |
| --- | --- |
| Home (`/`) | Uses a multi-column grid at `lg` with explicit `lg:col-start` / `row-start` placement. The DOM is written in mobile reading order, so the earlier `display: contents` and `order-*` reading-order problem is gone. Summary tiles use fill strong, and amounts are larger and tabular. "Dónde más gastas" uses category icons and colours. The forecast card has a retryable error state. |
| Capture (quick-add, voice, photo, draft review) | **One-handed capture:** Voz, Foto and Guardar sit in the thumb zone at the bottom of the sheet. Opening the sheet from "+" does not autofocus the amount field. A keyboard-inset helper keeps the category chips above the keyboard. Voice recording uses a non-blocking panel, and extraction shows a skeleton draft. Draft review has a sticky glass "Confirmar" bar with a spacer derived from tokens. Low-confidence fields are highlighted with the warning colour and an icon. On mobile the transcript and photo collapse above the form. A failed confirm scrolls to and focuses the first invalid control or the failure alert. |
| Movimientos | The second FAB is removed. Rows show the category icon circle, income is coloured and prefixed with "+", and amounts are tabular. "Cargar más" has a retryable error state. The feed has its own scroll strategy, and the filter, edit and transfer sheets were migrated. |
| Cuentas | Uses cards, skeletons and retryable alerts. The account detail, editor, settle-card and adjust-balance sheets were migrated. On-card insets use fill strong. |
| Presupuestos | Budget rows carry the category icon and colour. A shared `budget-status-label` component shows status. Unbudgeted rows wrap instead of truncating the name. |
| Informes / Patrimonio | Two-column layout at `lg`. The donut, legend and breakdown bars use each category's palette colour, falling back to the series slot only for uncoloured categories and "Otras". The active reports-nav link has a 3:1 ring. |
| Más (categorías, etiquetas, fijos, exportar, ajustes) | Use the shared cards, alerts, skeletons and back headers. Ajustes adds an "Apariencia" section with a Claro / Oscuro / Sistema segmented control and a "Reducir transparencia" switch. |
| Auth / misc | The login page was restyled. The `/capturar` placeholder page is removed and the route redirects to `/` with quick-add open. Every "Cargando…" text is replaced by a skeleton. |
| Shared reference data | `LedgerReferenceData` exposes a failed state. `reference-load-alert` adds a retryable alert to draft review and to the edit, transfer, settle and filter sheets, so selects no longer render empty without explanation. |

## 2. Decisions and deviations from the spec

- **Warning text in light mode** is darkened from `#b9480d` to `#a63f0b`, because the original failed AA on the orange tint and the warning callout. `#b9480d` is kept for the icon, fill and border. The spec is updated.
- **Dark `--viz-track` and on-card fills** use fill strong (`#424242`), not `#303030`, because `#303030` can't be seen on the `#2f2f2f` dark card. The spec is updated with an explicit rule.
- **Light `--glass-thick`** is `.88` instead of `.84`. This is above the spec's `.82` minimum and keeps amounts in bars calm over busy content.
- **Segmented indicator edge** is `#767676` in light (4.09:1 on `#f3f3f3`) and `#8f8f8f` in dark (4.08:1), so the selected segment meets the 3:1 rule for UI parts.
- **Dark checkbox fix:** the unlayered `.dark .dark:bg-input/30` transparency override is limited to unchecked controls. Before this fix it beat `dark:data-checked:bg-primary` in `@layer utilities`, so ticked boxes looked empty in dark mode.
- **Boot splash** is an Angular component shown until the first navigation resolves, not static markup in `index.html`. This keeps it themed with the same tokens.
- **`npx vitest run`** is not a supported entry point. Specs run only through the Angular unit-test builder (`npm test`), and there is no standalone Vitest config.

## 3. Accessibility results

### Contrast (WCAG 2.2, computed from the token values)

| Pair | Foreground | Background | Ratio | Target |
| --- | --- | --- | --- | --- |
| Text primary on page (light) | `#0d0d0d` | `#ffffff` | 19.44 | 4.5 |
| Text secondary on page (light) | `#5d5d5d` | `#ffffff` | 6.58 | 4.5 |
| Text secondary on grouped (light) | `#5d5d5d` | `#f9f9f9` | 6.25 | 4.5 |
| Text tertiary, meta only (light) | `#8f8f8f` | `#ffffff` | 3.23 | 3.0 |
| Income (light) | `#007a3d` | `#f9f9f9` | 5.18 | 4.5 |
| Danger text on error callout (light) | `#ba2623` | `#fff0f0` | 5.60 | 4.5 |
| Warning text on warning callout (light) | `#a63f0b` | `#fff5f0` | 5.86 | 4.5 |
| Info (light) | `#0169cc` | `#ffffff` | 5.39 | 4.5 |
| Link (light) | `#2964aa` | `#ffffff` | 6.00 | 4.5 |
| Segment indicator edge on track (light) | `#767676` | `#f3f3f3` | 4.09 | 3.0 |
| Primary button (light / dark) | `#ffffff` / `#0d0d0d` | `#0d0d0d` / `#ffffff` | 19.44 | 4.5 |
| Text primary on card (dark) | `#ececec` | `#2f2f2f` | 11.33 | 4.5 |
| Text secondary on card (dark) | `#b4b4b4` | `#2f2f2f` | 6.46 | 4.5 |
| Text secondary on page (dark) | `#b4b4b4` | `#212121` | 7.77 | 4.5 |
| Text tertiary on card (dark) | `#afafaf` | `#2f2f2f` | 6.10 | 3.0 |
| Income on card (dark) | `#40c977` | `#2f2f2f` | 6.27 | 4.5 |
| Danger text on error callout (dark) | `#ff8583` | `#4d100e` | 6.40 | 4.5 |
| Warning text on warning callout (dark) | `#ff9e6c` | `#4a2206` | 6.80 | 4.5 |
| Info on card (dark) | `#7ab7ff` | `#2f2f2f` | 6.40 | 4.5 |
| Link on page (dark) | `#7ab7ff` | `#212121` | 7.70 | 4.5 |
| Segment indicator edge on track (dark) | `#8f8f8f` | `#303030` | 4.08 | 3.0 |

Glass surfaces that hold text use alpha ≥ .86. In the worst case (`.86` over a black backdrop), text keeps AA because the glass tint is effectively the opaque surface it replaces. The QA screenshots confirm this visually for the tab bar, top bar, sheets and toasts. With reduced transparency or high contrast, every glass surface becomes solid.

### Automated checks (QA cycle 3, prod-like stack over HTTPS)

- **Playwright:** 141 passed and 2 skipped (the HSTS check needs production TLS) on chromium and webkit (iPhone 15). This includes M8 axe WCAG 2.2 AA in light and dark on every route, plus the 44px tap-target checks.
- **Unit tests:** `npm test`: 91 files and 682 tests passed. Lint, Prettier and `npm run build` (with the CSP / iOS meta / splash post-build check) are green.
- **Not checked by axe:** the Home reading order and the capture alert announcements were reviewed by hand (see below).

## 4. Screenshots

The latest set is in **`.qa/cycle-3/`** at the repository root. **`.qa/` is git-ignored and not committed**, so it exists only on the machine that ran QA. It holds about 400 files:

- `{mobile,desktop}-{light,dark}[-reduced]-<route>[-bottom].png`: every route at 390×844 and 1440×900, in light and dark, with normal and reduced transparency, plus scrolled-to-bottom captures.
- `*-open-*.png`: open overlays (quick-add, edit, filter and transfer sheets, dialog, row menu, toast, budget history).
- `*-loading-*.png` and `*-error-*.png`: skeleton and retryable error states.
- `montages/`: side-by-side light/dark comparison sheets (`m-*` mobile, `d-*` desktop, `seg-*` per-route segments).
- `crops/`: close-ups used as finding evidence (checkbox, loading probe, quick-add bottom row).
- `logs/`: lint, Prettier, unit, build and e2e logs.

The fixes made after cycle 3 (listed in section 5) have no cycle-3 screenshots. Run a new QA cycle to capture them.

## 5. Findings status

### Fixed after cycle 3 (in code; not yet re-captured in screenshots)

- Ticked checkbox looked unticked in dark mode (styles.css override scoped).
- Home reading and focus order did not match the visual order (explicit grid placement).
- Category colours missing or mismatched in Home, Budgets and Reports.
- Blank screen during the session check (boot splash).
- Light segmented indicator below 3:1.
- `ui-switch` read its description twice (the description is now outside the label).
- Reference-data load failures were swallowed (failed state plus `reference-load-alert`).
- Forecast card disappeared on error, and "Cargar más" failed silently (retryable alerts).
- Budget category name was truncated.
- The sticky "Confirmar" gave no feedback when an error was off-screen (scroll and focus).
- The draft review spacer was a hardcoded `h-20` (now derived from tokens).
- The tab indicator drifted with `1fr` columns (now `minmax(0,1fr)`).

### Unresolved

| Severity | Where | Finding | Suggested fix |
| --- | --- | --- | --- |
| Major (a11y) | `quick-add/capture-controls.ts:103`, `quick-add-sheet.ts:142`, `drafts/review/draft-review.page.ts:256` | Capture failure messages (microphone denied, voice/photo extraction failed) use `ui-alert tone="warning"`, which maps to `role="status"`. They are inserted already filled, so screen readers likely won't announce them. Before the redesign they were `role="alert"`. | Add an `urgent` input to `ui-alert` that forces `role="alert"`, and use it for these three alerts. |
| Minor | `features/settings/settings.page.ts` ("Periodo actual") | In dark mode the inset uses `variant="grouped"` (`#171717`, recessed) instead of fill strong like the other on-card insets. | Use `variant="tinted"`. |
| Minor | `shared/ui/ui-sheet.ts` / `styles.css` sheet footer | With transparency on, page text shows through behind the quick-add Voz/Foto/Guardar row (sheet alpha is .92 / .94). | Give `[data-slot='sheet-footer']` an opaque `--glass-menu-solid` background, or raise the sheet alpha to ≥ .96. |
| Minor (test gap) | `frontend/e2e` | No e2e or visual assertion covers a ticked checkbox in dark mode, so the regression could come back. | Assert the computed background equals `--primary` on a checked `role=checkbox` under `.dark`. |
| Info | `frontend` tooling | `npx vitest run` fails because there is no standalone config and it collects the e2e specs. | Use `npm test`, or add a `vitest.config` that excludes `e2e/` if a direct runner is wanted. |

## 6. Recommended manual checks on a real iPhone

1. **Glass tuning:** check the tab bar, top bar, sheets and menus over the busiest screens (Home with charts, Movimientos while scrolling) in both themes and in sunlight. Adjust `--glass-*-tint` alphas and `--glass-blur` / `--glass-blur-thick` if text feels busy or the glass looks flat. Watch scroll performance with two or three blurred layers.
2. **Status bar and safe areas:** in the installed PWA with `black-translucent`, check status-bar legibility in light and dark, top-bar padding below the Dynamic Island, and tab-bar clearance above the home indicator in portrait and landscape.
3. **PWA install:** add to the Home Screen, then check the monochrome icon, the light and dark splash screens on launch, `theme-color` tinting in Safari 26 when the theme is forced in Ajustes, and the update banner.
4. **Theme flash:** cold-start the installed app with the theme forced against the system setting (for example dark app on light iOS). There should be no white or black flash before the boot splash. Repeat with "Reducir transparencia" enabled.
5. **One-handed capture:** with the phone in one hand, check that "+", Voz, Foto and Guardar are reachable. Opening quick-add must not raise the keyboard. Category chips must stay visible above the keyboard after tapping the amount.
6. **Microphone and camera flows:** grant and deny permissions and check that the failure alerts appear (and are announced with VoiceOver; see the unresolved finding).
7. **VoiceOver and Dynamic Type:** check Home reading order, the tab bar labels, the switches in Ajustes, and the draft review bar at the largest text sizes.
8. **iOS accessibility settings:** turn on Reduce Transparency, Increase Contrast and Reduce Motion, and check that surfaces become solid and the spring animations stop.

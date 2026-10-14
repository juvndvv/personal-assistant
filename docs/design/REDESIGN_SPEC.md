# Redesign spec: Apple-style glass + ChatGPT neutral palette

Status: approved 2026-10-14. Scope: frontend only (`frontend/`). Deliberate departure from the Yurest brand guide (coral accent, flat surfaces): this is a personal project.

## 1. Decisions

| Topic | Decision |
| --- | --- |
| Accent | Pure monochrome, like ChatGPT. Primary button black on light, white on dark. Color only carries meaning (income, warnings, budgets, charts, categories). |
| Theme | Light / Dark / System selector. Applies yukit's `.dark` class on `<html>`. Stored in `localStorage` per device. No backend change. |
| Reduce transparency | In-app toggle (Safari lacks `prefers-reduced-transparency`), stored in `localStorage`, applied as `html[data-transparency="reduced"]`. Also honor the media query where supported. |
| Font | System stack: `-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. Drop Geist. Tabular figures for amounts. |
| UX scope | One-handed capture, desktop layout, states and hierarchy, cleanup (see section 6). |

## 2. Neutral palette (source: ChatGPT production CSS)

| Role | Light | Dark |
| --- | --- | --- |
| Page background (`--background`) | `#ffffff` | `#212121` |
| Grouped / secondary surface (shell, sidebar) | `#f9f9f9` | `#171717` |
| Elevated surface (`--card`) | `#ffffff` | `#2f2f2f` |
| Tertiary fill (`--muted`, chips, tracks) | `#f3f3f3` | `#303030` |
| Fill strong (`--accent`, selected items) | `#ececec` | `#424242` |
| Hover overlay | `#0d0d0d05` | `#ffffff1a` |
| Pressed overlay | `#0d0d0d0d` | `#ffffff0d` |
| Border xlight / light / medium / heavy | `#0000000d` / `#0000001a` / `#00000026` / `#00000033` | `#ffffff0d` / `#ffffff1a` / `#ffffff26` / `#ffffff33` |
| Text primary (`--foreground`) | `#0d0d0d` | `#ececec` |
| Text secondary (`--muted-foreground`) | `#5d5d5d` | `#b4b4b4` |
| Text tertiary (meta only, ≥3:1) | `#8f8f8f` | `#afafaf` |
| Text disabled | `#cdcdcd` | `#676767` |
| Primary button (`--primary` / `--primary-foreground`) | `#0d0d0d` / `#ffffff`; hover `#0d0d0dcc`; press `#0d0d0de5` | `#ffffff` / `#0d0d0d`; hover `#ffffffcc`; press `#ffffffe5` |
| Focus ring (`--ring`) | `#0d0d0d` | `#ffffff` |
| Link | `#2964aa` | `#7ab7ff` |
| Scrim | `#0d0d0d80` | `#0d0d0d80` |

Dark `--muted` (`#303030`) is almost identical to the dark `--card` (`#2f2f2f`): never use `--muted` as a fill on top of `--card`; use fill strong (`#424242`) for chips, tracks and fills placed on cards.

Gray primitives to remap (`--gray-1..12`): build a monotone ramp from the ChatGPT scale (50 `#f9f9f9`, 100 `#ececec`, 200 `#e3e3e3`, 300 `#cdcdcd`, 400 `#b4b4b4`, 500 `#9b9b9b`, 600 `#676767`, 700 `#424242`, 750 `#2f2f2f`, 800 `#212121`, 900 `#171717`, 950 `#0d0d0d`) for both `:root` and `.dark`. Remap yukit's coral `--primary-1..9` to the neutral ramp so nothing coral survives.

### Semantic colors (WCAG AA checked)

| Meaning | Light | Dark | Rule |
| --- | --- | --- | --- |
| Income (+) | `#007a3d` | `#40c977` | Sign first, color second |
| Expense (−) | text primary | text primary | Neutral; sign carries meaning |
| Transfer (⇄) | `#5d5d5d` | `#b4b4b4` | Icon + neutral |
| Danger / over budget text | `#ba2623` | `#ff8583` | Fill `#e02e2a` / `#ff6764` |
| Warning / near budget (≥80 %) | `#a63f0b` (icon / fill / border `#b9480d`) | `#ff9e6c` | Text darkened from `#b9480d` to stay AA on the orange tint and warning callout bg |
| Success | `#007a3d` | `#40c977` | Never `#008635` on `#f9f9f9` (fails AA) |
| Info | `#0169cc` | `#7ab7ff` | |
| Badge tints | green `#04b84c26`, red `#fa423e29`, orange `#fb6a2229`, blue `#0285ff21` | same | Solid semantic color as text on top |
| Error / warning callout bg | `#fff0f0` / `#fff5f0` | `#4d100e` / `#4a2206` | |

### Charts and categories (`--viz-series-1..8`)

- Light: `#3566f0`, `#027c6a`, `#9639ed`, `#d8241a`, `#9f5c14`, `#0d78a1`, `#cf42c5`, `#758e1a`.
- Dark: `#81a6f9`, `#04bb9f`, `#c8a4fb`, `#ff8066`, `#ffcc38`, `#00b1ff`, `#dd6adc`, `#b6d80b`.
- Grid `#0000000d` / `#ffffff1a`; axis labels `#8f8f8f` / `#afafaf`; track `#ececec` / `#424242` (`--viz-track` = fill strong; `#303030` is invisible on the `#2f2f2f` dark card).
- Category colors (`category-appearance.ts`): replace the 12 hex literals with 12 palette keys that resolve to CSS variables with light and dark values (extend the series above to 12). Existing stored values must map to the nearest key (frontend mapping, no data migration).

## 3. Glass system

Glass only on the **navigation layer**: tab bar, top bar, sidebar (desktop), FAB, sheets, dialogs, menus/popovers, toasts. **Never** on content: lists, cards, forms, inputs. Never glass on glass: controls inside glass use `--glass-fill-on-glass` (no blur).

```css
:root {
  --glass-blur: 24px; --glass-blur-thick: 32px; --glass-saturate: 180%;
  --glass-regular: rgb(255 255 255 / .72);   /* small floating controls */
  --glass-thick:   rgb(249 249 249 / .84);   /* bars, sidebar, anything holding amounts */
  --glass-menu:    rgb(255 255 255 / .92);   /* menus, popovers, toasts, sheets */
  --glass-hairline: rgb(13 13 13 / .08);
  --glass-edge: rgb(255 255 255 / .6);
  --glass-specular: linear-gradient(180deg, rgb(255 255 255 / .4) 0%, rgb(255 255 255 / 0) 40%);
  --glass-shadow: 0 1px 2px rgb(0 0 0 / .06), 0 8px 24px rgb(0 0 0 / .10);
  --glass-shadow-raised: 0 2px 6px rgb(0 0 0 / .08), 0 20px 50px rgb(0 0 0 / .18);
  --glass-fill-on-glass: rgb(120 120 128 / .14);
}
.dark {
  --glass-regular: rgb(33 33 33 / .72);
  --glass-thick:   rgb(24 24 24 / .86);
  --glass-menu:    rgb(47 47 47 / .94);
  --glass-hairline: rgb(255 255 255 / .10);
  --glass-edge: rgb(255 255 255 / .10);
  --glass-specular: linear-gradient(180deg, rgb(255 255 255 / .08) 0%, rgb(255 255 255 / 0) 35%);
  --glass-shadow: 0 1px 2px rgb(0 0 0 / .3), 0 8px 24px rgb(0 0 0 / .35);
  --glass-shadow-raised: 0 2px 8px rgb(0 0 0 / .4), 0 24px 60px rgb(0 0 0 / .55);
  --glass-fill-on-glass: rgb(118 118 128 / .24);
}
```

Recipe for a `.glass` surface: background stack `var(--glass-specular), var(--glass-thick)`; `-webkit-backdrop-filter` and `backdrop-filter`: `blur(var(--glass-blur)) saturate(var(--glass-saturate))`; `box-shadow: inset 0 1px 0 var(--glass-edge), inset 0 0 0 .5px var(--glass-hairline), var(--glass-shadow)`. Always keep the prefixed property.

Rules:
- Minimum alpha .82 for any glass that holds secondary text or amounts. `--glass-regular` (.72) only for icon-only controls.
- Max 2–3 blurred layers on screen; never blur a large scrolling container; never animate the blur radius (animate transform/opacity).
- Sheets, dialogs and menus render in CDK overlay at body level (avoid fixed-position containing-block bugs from `backdrop-filter` ancestors).
- Do **not** make `--background` translucent (yukit reuses it as foreground/ring color). Translucency goes through `--popover`, `--sidebar` and the `--glass-*` tokens. Toasts use `--popover`, so they become glass too (intended).
- Scroll edge: content scrolls under the bars; bars fade content with a gradient mask instead of a hard border.
- Ambient background so glass has something to show: fixed `body::before` with two very soft radial gradients (neutral/cool, 6–10 % light, 10–16 % dark), never animated. Dark page base under glass stays `#212121`.
- Fallbacks: `@supports not (backdrop-filter…)` → solid surface; `html[data-transparency="reduced"]` and `@media (prefers-reduced-transparency: reduce)` → solid surfaces, no blur; `@media (prefers-contrast: more)` → solid + 1px `CanvasText` border, secondary text = primary; `prefers-reduced-motion` → no motion.
- Hardcoded yukit literals to override in CSS: overlay scrim `bg-black/10` (dialog, alert-dialog, sheet, drawer), slider thumb `bg-white`, pagination `text-gray-600`, bubble oklch, sidebar submenu gradient using `--gray-1`. The toaster must follow the theme (`theme` bound to the resolved theme).

## 4. Shape, depth, type, motion

- Controls (buttons, segmented, chips, tab bar, FAB): capsules (`9999px`). Min touch target 44px.
- Containers: cards 16px, sheets 28px top corners (24px all round when floating on desktop), menus 16px, menu items 10px. Concentric rule: inner radius = outer radius − padding.
- Map radii to tokens (`--radius`, `--radius-component-*`, `--radius-container-*`) instead of raw `rounded-*` defaults.
- Shadows: cards `0 .25rem 1rem #0000000d` in light, none in dark (borders + lighter surfaces instead); popovers/sheets use `--glass-shadow(-raised)`.
- Type: system stack, 17px body on mobile, 16px desktop; weights 400 body / 500 labels and buttons / 600 headings; no text under 12px (replace `text-[10px]`/`text-[11px]`). Amounts: `font-variant-numeric: tabular-nums`, semibold, a size above their label.
- Motion: spring-like `cubic-bezier(.32,.72,0,1)` 350–450 ms for sheets and menus (from the tap point), 150 ms for hovers; respect reduced motion.

## 5. PWA chrome

- `index.html`: `viewport-fit=cover`; `apple-mobile-web-app-status-bar-style` `black-translucent`; two `theme-color` metas with `media="(prefers-color-scheme: light|dark)"` (`#ffffff` / `#212121`) plus a runtime update when the user forces a theme; `html { background: var(--background) }` per theme (Safari 26 tints from it).
- Safe areas: top bar padded with `env(safe-area-inset-top)`; tab bar and every fixed bottom element with `env(safe-area-inset-bottom)`; main content padding = bar height + inset (no fixed `pb-28` / `bottom-24`).
- Manifest: `theme_color` `#ffffff`, `background_color` `#ffffff`; regenerate icons and the 18 iOS splash screens in a monochrome style (light + dark splash where supported) via `scripts/generate-icons.mjs`.

## 6. UX changes

**Shared components** (in `src/app/shared/ui/`): `ui-card`, `ui-alert` (with optional retry action), `ui-skeleton`, `ui-glass-bar` (top/bottom), plus a `ThemeService` (light/dark/system + reduced transparency). Migrate the ~25 copied card strings and ~25 inline error boxes to them. Fix `ui-sheet` (glass, radii, `side` = bottom on mobile, right on desktop ≥ md by default), `ui-toast` (theme binding), `ui-segmented`, `ui-tabs`, `ui-select`, `ui-combobox`, `ui-date-input`, `ui-field`, `ui-money-input`, `ui-empty-state`, `ui-button` (capsule; primary = monochrome).

**Shell**: mobile floating capsule tab bar inset 16px from the edges, glass, sliding selection indicator using `--glass-fill-on-glass`, active state shown by icon weight/fill + label (not color only), centered "+" as a glass/primary capsule; desktop sidebar on glass with the shell grouped background; glass top bar with page title and back button where the page is nested (`page-header` gains an optional back link, replacing hand-rolled "← Más" links).

**One-handed capture**:
- Quick-add sheet: Voz and Foto as large buttons in the bottom zone of the sheet (thumb reach), next to the save action; the amount field does **not** autofocus when the sheet opens from the "+" (keyboard only on tap). Category chips stay reachable above the keyboard.
- Voice: non-blocking recording panel with clear state; while extraction runs show a skeleton draft, not a blocking spinner.
- Draft review: sticky bottom action bar (glass) with "Confirmar"; low-confidence fields highlighted with the warning color + icon; on mobile the transcript/photo collapses above the form.

**Desktop (≥ lg)**: Home as a multi-column grid (summary tiles, recent activity, budgets, forecast side by side); Reports as a 2-column layout; content max width grows (no single narrow column); sheets open from the right side.

**States and hierarchy**: skeletons for every loading state (replace the 7 "Cargando…" texts and Home's blank state); `ui-alert` with "Reintentar" for every load error; amounts more prominent (semibold, larger, tabular, income colored with "+"); category color visible in lists (tinted icon circle using the category palette key).

**Cleanup**: remove the second FAB on Movimientos; remove the `/capturar` placeholder route and page (redirect `/capturar` to `/` opening quick-add, or just drop it if nothing links to it).

**Settings**: "Apariencia" section with theme (Claro / Oscuro / Sistema, segmented) and "Reducir transparencia" switch.

## 7. Quality bar

- No hex/rgb literals outside `styles.css` (and the category/viz token definitions). No Tailwind palette classes (`gray-*`, `red-*`).
- Every screen readable in light and dark: text AA (4.5:1), UI parts 3:1, including over glass (check against worst-case backdrop).
- axe WCAG 2.2 AA e2e passes in both themes; existing tests stay green; new components and ThemeService have Vitest tests.
- Visual QA by screenshots at 390×844 (iPhone) and 1440×900, light and dark, for every route listed in the UI audit.

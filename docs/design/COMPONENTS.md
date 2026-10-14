# Component usage guide (glass redesign)

How feature screens use the shared design system. The source of truth for the design is [REDESIGN_SPEC.md](./REDESIGN_SPEC.md); this guide covers the implementation. Everything below is in `frontend/src`.

## Ground rules

- **No colour literals in features.** Use semantic Tailwind classes backed by tokens in `styles.css`. Never use palette classes (`gray-*`, `red-*`) or `bg-white` / `text-black`.
- **Glass only on the navigation layer**: bars, sidebar, sheets, dialogs, menus, toasts. Content (cards, lists, forms) stays solid. Controls placed on glass use `glass-fill`, never another glass layer.
- **Pick radii by role**, never raw `rounded-*` numbers: `rounded-capsule` (buttons, chips, pills), `rounded-card` (16px containers), `rounded-menu` / `rounded-menu-item`, `rounded-sheet` / `rounded-sheet-floating`, `rounded-lg` (inputs, 10px).
- **No text under 12px** (`text-xs` is the minimum). Body text is 17px on mobile and 16px on desktop, set on `body`.
- **Every fixed or sticky bottom element** sits at `bottom-[var(--shell-bottom-inset)]`. Never hardcode `bottom-24`, `pb-28` or similar. The shell already pads `<main>`.

## Token cheat sheet

| Need                                | Class                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Primary / secondary / tertiary text | `text-foreground` / `text-muted-foreground` / `text-subtle-foreground` (metadata only)                        |
| Inline link                         | `text-link` (`text-primary-text` is now an alias of the link colour)                                          |
| Page / grouped / card surface       | `bg-background` / `bg-grouped` / `bg-card`                                                                    |
| Chips, tracks, quiet fills          | `bg-muted` (tertiary), `bg-fill-strong` (selected)                                                            |
| Hover / pressed overlay             | `hover:bg-hover`, `active:bg-pressed`                                                                         |
| Hairline / regular / strong border  | `border-hairline` / `border-border` / `border-border-strong`                                                  |
| Feedback text                       | `text-danger-text`, `text-warning-text`, `text-success-text`, `text-info-text`                                |
| Badge tints                         | `bg-tint-green`, `bg-tint-red`, `bg-tint-orange`, `bg-tint-blue` (with the solid semantic text colour on top) |
| Callout backgrounds                 | `bg-callout-error`, `bg-callout-warning`, `bg-callout-success`, `bg-callout-info`                             |
| Money                               | `text-income`, `text-expense`, `text-transfer`                                                                |
| Card shadow                         | `shadow-card` (none in dark mode)                                                                             |
| Spring easing                       | `ease-spring` (sheets, indicators); hovers use `duration-150`                                                 |

`bg-primary` is monochrome: black on light, white on dark. Use it only for the main action.

## `ui-card` / `[uiCard]`

This replaces every hand-written `rounded-2xl border border-border bg-background p-5` string. It is a directive, so it works on any element:

```html
<ui-card>…</ui-card>
<!-- block, p-4 md:p-5 -->
<section uiCard padding="lg" class="mt-6">…</section>
<!-- your classes are kept -->
<ul uiCard divided>
  <!-- list: no padding, divide-y, overflow hidden -->
  <li class="flex items-center gap-3 px-4 py-3">…</li>
</ul>
<a uiCard interactive routerLink="/informes">…</a>
<!-- hover/pressed feedback -->
```

Inputs: `padding` (`none | sm | md | lg`, default `md`), `variant` (`elevated` (default) | `grouped` | `tinted`), `divided`, `interactive`.

- The card is `block` unless your static `class` sets a display utility (`flex`, `grid`, `inline-flex`, `hidden`, …); then your display wins, so `<section uiCard class="flex flex-col">` works as expected. Responsive display classes (`md:grid`) are layered on top of `block`.
- `tinted` is `bg-muted` on light and `bg-fill-strong` on dark, so it stays visible when nested inside an elevated card (`--muted` equals the dark card colour).

## `ui-alert`: every load or save error

This replaces the inline `<p role="alert" class="rounded-lg bg-destructive/10 …">` boxes. Load errors must offer a retry:

```html
@if (failure(); as message) {
<ui-alert retryable [retrying]="loading()" (retry)="load()"
  >{{ message }}</ui-alert
>
}
<ui-alert tone="warning" title="Presupuesto casi agotado"
  >Llevas el 85 %.</ui-alert
>
```

- `tone`: `error` (default) | `warning` | `info` | `success`. Error and warning use `role="alert"`; info and success use `role="status"`.
- `retryable` shows a secondary "Reintentar" capsule (`retryLabel` to rename it) and emits `(retry)`. `retrying` disables it with a spinner.
- Leave the field-level validation hints to the form controls (`hint` + `state="error"`).

## Loading: `ui-skeleton` and `ui-skeleton-list`

No more "Cargando…" text or blank screens. Render the skeleton in the shape of the content it replaces:

```html
@if (loading()) {
<ui-card padding="none">
  <ui-skeleton-list label="Cargando movimientos" [rows]="6" />
</ui-card>
} @else { … }

<!-- custom shapes -->
<div role="status" aria-live="polite">
  <span class="sr-only">Cargando resumen</span>
  <ui-skeleton shape="title" />
  <ui-skeleton shape="amount" class="mt-3" />
  <ui-skeleton [lines]="3" class="mt-4" />
</div>
```

Shapes: `text` (default), `title`, `amount`, `circle`, `block`, `pill`; plus `lines`, `width` and `height` overrides. `ui-skeleton` is `aria-hidden`, so wrap custom skeletons in a `role="status"` region with a visually hidden label. `ui-skeleton-list` already includes one.

## Glass bars: `ui-glass-bar`

- The **shell top bar** is already a `ui-glass-bar` that shows the page title (once the large title scrolls away) and the back button. Pages do not add their own top bar.
- **Sticky bottom action bar** (for example "Confirmar" on draft review), placed as the last child of the page content:

```html
<ui-glass-bar position="bottom">
  <ui-button class="flex-1" [fullWidth]="true" (clicked)="confirm()"
    >Confirmar</ui-button
  >
</ui-glass-bar>
```

It sticks at `--shell-bottom-inset` (above the floating tab bar on mobile, at the bottom edge on desktop) and handles the safe area. Use `floating` for an inset capsule and `[sticky]="false"` to position it yourself. Controls inside a bar use `glass-fill` (or `ui-segmented [onGlass]="true"`).

Raw utilities for custom navigation surfaces: `glass` (thick, for bars and anything holding amounts or secondary text), `glass-regular` (only icon-only floating controls), `glass-menu`, `glass-flat` (drops the drop shadow), `glass-fill`, `scroll-edge-top` / `scroll-edge-bottom`. All of them fall back to solid surfaces when the browser lacks `backdrop-filter`, when the user enables "Reducir transparencia", or under `prefers-reduced-transparency` / `prefers-contrast: more`.

## Page header and back navigation

```html
<app-page-header title="Ajustes" backLink="/mas" backLabel="Más">
  <ui-button pageHeaderActions size="sm" variant="secondary"
    >Exportar</ui-button
  >
</app-page-header>
```

Inside the shell, the back link renders in the glass top bar. Outside the shell (for example on auth pages) it renders inline. **Delete the hand-rolled `← Más` / `← Cuentas` links** when you migrate a page.

## Amounts

- Use the `amount` utility (tabular figures, semibold, slight negative tracking), one size step above the label.
- Income: `text-income` with an explicit `+`. Expense: `text-expense` (neutral; the minus sign carries the meaning). Transfer: `text-transfer` plus the ⇄ icon.

```html
<p class="text-sm text-muted-foreground">Gastos del mes</p>
<p class="amount text-3xl text-foreground">{{ total | eur }}</p>

<span class="amount" [class]="cents > 0 ? 'text-income' : 'text-expense'">
  {{ cents > 0 ? '+' : '' }}{{ cents | eur }}
</span>
```

`tabular-amount` still exists for tabular figures without the weight change (table cells, inputs).

## Category colours

Stored category colours stay `#RRGGBB` (the backend validates that format). The frontend maps every stored value to the nearest of 12 palette keys (`blue, teal, purple, red, amber, cyan, magenta, olive, orange, green, indigo, slate`). Each key resolves to `--category-<key>`, with separate light and dark values. Old values need no migration.

- Tinted icon circle in lists: `<app-category-icon [icon]="category.icon" [color]="category.color" size="sm" />` (`features/categories/category-icon.ts`; sizes `sm` 32px, `md` 40px, `lg` 48px).
- Anything else: `categoryColorVar(stored)` returns `var(--category-green)` (or `null`). Bind it to `--category-color` and use the `category-icon` (tinted circle) or `category-swatch` (solid fill) utility:

```html
<span
  class="category-swatch size-3 rounded-full"
  [style.--category-color]="colorVar(category.color)"
></span>
```

- When saving, write `categoryColorValue(key)` (the editor sheet already does this).
- Charts keep using `--viz-series-1..8`. These are the first 8 category keys, so a category and its chart series share a hue.

## Controls (updated wrappers)

- `ui-button`: a capsule, 44px tall at `md`. `primary` is monochrome. Use `danger` only for destructive confirmations.
- `a[uiButtonLink]`: the same capsule look on a real anchor, for navigation (`routerLink`) and downloads (`href` + `download`). Never copy `bg-primary rounded-capsule …` strings onto `<a>` elements.

  ```html
  <a uiButtonLink routerLink="/mas/fijos/nuevo">Nuevo fijo</a>
  <a uiButtonLink variant="outline" [href]="csvUrl()" download>Descargar CSV</a>
  <a uiButtonLink fullWidth [href]="archiveUrl()" download>Descargar ZIP</a>
  ```

  Inputs: `variant` (`primary` (default) | `secondary` | `outline` | `ghost`), `size` (`sm | md | lg`, heights are minimums so long labels wrap), `fullWidth`.

- `ui-segmented` / `ui-tabs`: a capsule track with a sliding indicator; the active label is semibold, so colour is not the only cue. Pass `[onGlass]="true"` to `ui-segmented` inside sheets or bars.
- `ui-sheet`: `side` defaults to `auto` (bottom sheet with 28px top corners on mobile, floating right panel at `md` and up). Pass `side` only to force a direction. The panel is glass with a spring animation.
- `ui-switch`: a labelled switch with an optional `description`; two-way `[(checked)]`.
- `ui-select`, `ui-combobox`, `ui-date-input`, `ui-money-input`, `ui-field`, `ui-empty-state`: same APIs as before. They are only restyled (token radii, glass listbox, `amount` styling for money, a larger empty-state icon).

## Theme

`ThemeService` (`core/theme/theme.service.ts`) exposes `preference()` (`light | dark | system`), `resolved()`, `reducedTransparency()`, `setPreference()` and `setReducedTransparency()`. It is stored per device in `localStorage` and applied as `html.dark` / `html[data-transparency="reduced"]`. `public/theme-init.js` applies the stored choice before first paint. Features never toggle `.dark` themselves. To check a screen in both themes, use Ajustes › Apariencia or `/dev/kitchen-sink` (development build).

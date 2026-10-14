import {
  Directive,
  HostAttributeToken,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';

export type UiCardPadding = 'none' | 'sm' | 'md' | 'lg';
export type UiCardVariant = 'elevated' | 'grouped' | 'tinted';

const BASE = 'rounded-card text-card-foreground';
const DEFAULT_DISPLAY = 'block';
const DISPLAY_UTILITIES = new Set([
  'block',
  'inline',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'flow-root',
  'table',
  'hidden',
]);

function declaresDisplay(classAttribute: string | null): boolean {
  return (classAttribute ?? '').split(/\s+/).some((token) => DISPLAY_UTILITIES.has(token));
}

const VARIANT_CLASS: Record<UiCardVariant, string> = {
  elevated: 'bg-card shadow-card border border-hairline dark:border-border',
  grouped: 'bg-grouped border border-hairline dark:border-border',
  tinted: 'bg-fill-on-card',
};

const PADDING_CLASS: Record<UiCardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 md:p-5',
  lg: 'p-5 md:p-6',
};

const DIVIDED_CLASS = 'overflow-hidden divide-y divide-border [&_:focus-visible]:-outline-offset-2';
const INTERACTIVE_CLASS =
  'transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--card),var(--foreground)_3%)] active:bg-[color-mix(in_oklab,var(--card),var(--foreground)_6%)]';

@Directive({
  selector: 'ui-card, [uiCard]',
  host: { '[class]': 'cardClass()' },
})
export class UiCard {
  readonly padding = input<UiCardPadding>('md');
  readonly variant = input<UiCardVariant>('elevated');
  readonly divided = input(false, { transform: booleanAttribute });
  readonly interactive = input(false, { transform: booleanAttribute });

  private readonly display = declaresDisplay(
    inject(new HostAttributeToken('class'), { optional: true }),
  )
    ? ''
    : DEFAULT_DISPLAY;

  protected readonly cardClass = computed(() =>
    [
      this.display,
      BASE,
      VARIANT_CLASS[this.variant()],
      PADDING_CLASS[this.divided() ? 'none' : this.padding()],
      this.divided() ? DIVIDED_CLASS : '',
      this.interactive() ? INTERACTIVE_CLASS : '',
    ]
      .filter((part) => part !== '')
      .join(' '),
  );
}

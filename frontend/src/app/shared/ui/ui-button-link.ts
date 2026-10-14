import { Directive, booleanAttribute, computed, input } from '@angular/core';

export type UiButtonLinkVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type UiButtonLinkSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-capsule text-center font-medium no-underline transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const SIZE_CLASS: Record<UiButtonLinkSize, string> = {
  sm: 'min-h-9 gap-1.5 px-3.5 py-1.5 text-sm',
  md: 'min-h-11 gap-2 px-5 py-2 text-[0.9375rem]',
  lg: 'min-h-12 gap-2 px-6 py-2.5 text-base',
};

const VARIANT_CLASS: Record<UiButtonLinkVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/80 active:bg-primary/90',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-[var(--secondary-fill-hover)] active:bg-[var(--secondary-fill-pressed)]',
  outline: 'border border-border text-foreground hover:bg-hover active:bg-pressed',
  ghost: 'text-foreground hover:bg-hover active:bg-pressed',
};

@Directive({
  selector: 'a[uiButtonLink]',
  host: { '[class]': 'linkClass()' },
})
export class UiButtonLink {
  readonly variant = input<UiButtonLinkVariant>('primary');
  readonly size = input<UiButtonLinkSize>('md');
  readonly fullWidth = input(false, { transform: booleanAttribute });

  protected readonly linkClass = computed(() =>
    [BASE, SIZE_CLASS[this.size()], VARIANT_CLASS[this.variant()], this.fullWidth() ? 'w-full' : '']
      .filter((part) => part !== '')
      .join(' '),
  );
}

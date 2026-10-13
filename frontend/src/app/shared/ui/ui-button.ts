import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { YuwButtonComponent, YuwColorDto, YuwSpinnerComponent } from 'yukit-web';

export type UiButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type UiButtonSize = 'sm' | 'md' | 'lg' | 'icon';

type YuwButtonVariant = 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'link';
type YuwButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const VARIANTS: Record<UiButtonVariant, { variant: YuwButtonVariant; color: YuwColorDto }> = {
  primary: { variant: 'default', color: 'primary' },
  secondary: { variant: 'secondary', color: 'neutral' },
  outline: { variant: 'outline', color: 'neutral' },
  ghost: { variant: 'ghost', color: 'neutral' },
  danger: { variant: 'default', color: 'destructive' },
  link: { variant: 'link', color: 'primary' },
};

const SIZES: Record<UiButtonSize, YuwButtonSize> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  icon: 'icon',
};

@Component({
  selector: 'ui-button',
  imports: [YuwButtonComponent, YuwSpinnerComponent],
  host: { '[class.ui-button-full]': 'fullWidth()' },
  styles:
    ':host(.ui-button-full) { display: block; width: 100%; } :host(.ui-button-full) yuw-button { display: flex; width: 100%; }',
  template: `
    <yuw-button
      [variant]="mapped().variant"
      [color]="mapped().color"
      [size]="yuwSize()"
      [type]="type()"
      [disabled]="disabled() || loading()"
      [ariaLabel]="ariaLabel()"
      [class]="fullWidth() ? 'w-full' : ''"
      (clicked)="clicked.emit($event)"
    >
      @if (loading()) {
        <yuw-spinner [label]="loadingLabel()" />
      }
      <ng-content />
    </yuw-button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiButton {
  readonly variant = input<UiButtonVariant>('primary');
  readonly size = input<UiButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly loadingLabel = input('Cargando');
  readonly fullWidth = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string>();

  readonly clicked = output<MouseEvent>();

  protected readonly mapped = computed(() => VARIANTS[this.variant()]);
  protected readonly yuwSize = computed(() => SIZES[this.size()]);
}

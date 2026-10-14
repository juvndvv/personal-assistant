import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { CATEGORY_ICON_SVGS, categoryColorVar, iconNameFor } from './category-appearance';

export type CategoryIconSize = 'sm' | 'md' | 'lg';

const SIZES: Record<CategoryIconSize, { box: string; icon: string }> = {
  sm: { box: 'size-8', icon: '18' },
  md: { box: 'size-10', icon: '20' },
  lg: { box: 'size-12', icon: '24' },
};

@Component({
  selector: 'app-category-icon',
  imports: [NgIcon],
  providers: [provideIcons(CATEGORY_ICON_SVGS)],
  host: {
    'aria-hidden': 'true',
    '[class]': 'hostClass()',
    '[style.--category-color]': 'colorVar()',
  },
  template: `<ng-icon [name]="iconName()" [size]="sizing().icon" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryIcon {
  readonly icon = input<string | null>(null);
  readonly color = input<string | null>(null);
  readonly size = input<CategoryIconSize>('md');

  protected readonly sizing = computed(() => SIZES[this.size()]);
  protected readonly iconName = computed(() => iconNameFor(this.icon()));
  protected readonly colorVar = computed(() => categoryColorVar(this.color()));
  protected readonly hostClass = computed(
    () =>
      `category-icon inline-flex shrink-0 items-center justify-center rounded-full ${this.sizing().box}`,
  );
}

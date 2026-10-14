import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

export type UiGlassBarPosition = 'top' | 'bottom';

const POSITION_CLASS: Record<UiGlassBarPosition, { sticky: string; edge: string }> = {
  top: {
    sticky: 'sticky top-0',
    edge: 'glass-flat scroll-edge-top pt-[env(safe-area-inset-top)]',
  },
  bottom: {
    sticky: 'sticky bottom-[var(--shell-bottom-inset)]',
    edge: 'glass-flat scroll-edge-bottom pb-[var(--bottom-bar-safe-area)]',
  },
};

@Component({
  selector: 'ui-glass-bar',
  host: {
    '[class]': 'hostClass()',
    '[attr.data-position]': 'position()',
  },
  template: `
    <div
      class="mx-auto flex w-full items-center gap-2"
      [class]="
        floating() ? 'min-h-14 px-3 py-2' : 'min-h-[var(--top-bar-height)] px-4 py-2 md:px-8'
      "
    >
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiGlassBar {
  readonly position = input<UiGlassBarPosition>('top');
  readonly floating = input(false, { transform: booleanAttribute });
  readonly sticky = input(true, { transform: booleanAttribute });

  protected readonly hostClass = computed(() => {
    const position = POSITION_CLASS[this.position()];
    const shape = this.floating()
      ? `glass mx-4 rounded-sheet-floating ${this.position() === 'top' ? 'mt-3' : 'mb-3'}`
      : `glass ${position.edge}`;
    return ['z-30 block', this.sticky() ? position.sticky : '', shape]
      .filter((part) => part !== '')
      .join(' ');
  });
}

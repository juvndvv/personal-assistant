import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  computed,
  contentChild,
  input,
  model,
} from '@angular/core';
import { YuwSheetImports } from 'yukit-web';
import { mediaQuerySignal } from '../../core/theme/media-query';

export type UiSheetSide = 'auto' | 'bottom' | 'right' | 'left' | 'top';
type ResolvedSheetSide = Exclude<UiSheetSide, 'auto'>;

export const DESKTOP_SHEET_QUERY = '(min-width: 768px)';

const PANEL_CLASS: Record<ResolvedSheetSide, string> = {
  bottom:
    'data-[side=bottom]:rounded-t-sheet data-[side=bottom]:border-t-0 data-[side=bottom]:max-h-[92dvh] data-[side=bottom]:pb-[env(safe-area-inset-bottom)]',
  right:
    'data-[side=right]:top-[calc(env(safe-area-inset-top)+0.75rem)] data-[side=right]:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] data-[side=right]:right-3 data-[side=right]:h-auto data-[side=right]:w-[calc(100%-1.5rem)] data-[side=right]:sm:max-w-md data-[side=right]:border-l-0 data-[side=right]:rounded-sheet-floating',
  left: 'data-[side=left]:top-[calc(env(safe-area-inset-top)+0.75rem)] data-[side=left]:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] data-[side=left]:left-3 data-[side=left]:h-auto data-[side=left]:w-[calc(100%-1.5rem)] data-[side=left]:sm:max-w-md data-[side=left]:border-r-0 data-[side=left]:rounded-sheet-floating',
  top: 'data-[side=top]:rounded-b-sheet data-[side=top]:border-b-0 data-[side=top]:pt-[env(safe-area-inset-top)]',
};

@Directive({ selector: '[uiSheetFooter]' })
export class UiSheetFooter {}

@Component({
  selector: 'ui-sheet',
  imports: [YuwSheetImports],

  template: `
    <yuw-sheet
      [(open)]="open"
      [showTrigger]="false"
      [side]="resolvedSide()"
      [title]="title()"
      [description]="description()"
      [closeLabel]="closeLabel()"
      [panelClass]="panelClass()"
    >
      <div cdkFocusInitial tabindex="-1" data-testid="sheet-body" class="outline-none">
        <ng-content />
      </div>
      @if (footer()) {
        <div yuwSheetFooter>
          <ng-content select="[uiSheetFooter]" />
        </div>
      }
    </yuw-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSheet {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly side = input<UiSheetSide>('auto');
  readonly closeLabel = input('Cerrar');

  protected readonly footer = contentChild(UiSheetFooter);
  private readonly desktop = mediaQuerySignal(DESKTOP_SHEET_QUERY);

  protected readonly resolvedSide = computed<ResolvedSheetSide>(() => {
    const side = this.side();
    if (side !== 'auto') {
      return side;
    }
    return this.desktop() ? 'right' : 'bottom';
  });
  protected readonly panelClass = computed(() => PANEL_CLASS[this.resolvedSide()]);
}

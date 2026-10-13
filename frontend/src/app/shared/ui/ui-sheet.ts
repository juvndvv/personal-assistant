import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  contentChild,
  input,
  model,
} from '@angular/core';
import { YuwSheetImports } from 'yukit-web';

export type UiSheetSide = 'bottom' | 'right' | 'left' | 'top';

@Directive({ selector: '[uiSheetFooter]' })
export class UiSheetFooter {}

@Component({
  selector: 'ui-sheet',
  imports: [YuwSheetImports],
  template: `
    <yuw-sheet
      [(open)]="open"
      [showTrigger]="false"
      [side]="side()"
      [title]="title()"
      [description]="description()"
      [closeLabel]="closeLabel()"
      [panelClass]="side() === 'bottom' ? 'rounded-t-3xl max-h-[92dvh]' : undefined"
    >
      <ng-content />
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
  readonly side = input<UiSheetSide>('bottom');
  readonly closeLabel = input('Cerrar');

  protected readonly footer = contentChild(UiSheetFooter);
}

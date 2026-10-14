import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  contentChild,
  input,
  model,
} from '@angular/core';
import { YuwDialogImports } from 'yukit-web';

@Directive({ selector: '[uiDialogFooter]' })
export class UiDialogFooter {}

@Component({
  selector: 'ui-dialog',
  imports: [YuwDialogImports],
  template: `
    <yuw-dialog
      [(open)]="open"
      [showTrigger]="false"
      [title]="title()"
      [description]="description()"
      [closeLabel]="closeLabel()"
      panelClass="w-[min(calc(100vw-2rem),25rem)] max-w-none sm:max-w-none"
    >
      <ng-content />
      @if (footer()) {
        <div yuwDialogFooter>
          <ng-content select="[uiDialogFooter]" />
        </div>
      }
    </yuw-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDialog {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly closeLabel = input('Cerrar');

  protected readonly footer = contentChild(UiDialogFooter);
}

import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { YuwCheckboxComponent } from 'yukit-web';
import { nextUiId } from './ui-types';

@Component({
  selector: 'ui-checkbox',
  imports: [YuwCheckboxComponent],
  template: `
    <yuw-checkbox
      [inputId]="inputId()"
      [name]="name()"
      [(checked)]="checked"
      [disabled]="disabled()"
      [primary]="true"
    >
      <ng-content />
    </yuw-checkbox>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCheckbox {
  readonly checked = model(false);
  readonly name = input<string>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly inputId = input(nextUiId('ui-checkbox'));
}

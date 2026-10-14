import { ChangeDetectionStrategy, Component, booleanAttribute, input, model } from '@angular/core';
import { YuwSwitchComponent } from 'yukit-web';
import { nextUiId } from './ui-types';

@Component({
  selector: 'ui-switch',
  imports: [YuwSwitchComponent],
  host: { class: 'block' },
  template: `
    <yuw-switch
      [inputId]="inputId()"
      [(checked)]="checked"
      [disabled]="disabled()"
      [primary]="true"
      [ariaDescribedby]="description() ? descriptionId() : undefined"
      class="flex w-full"
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium text-foreground"><ng-content /></span>
        @if (description()) {
          <span [id]="descriptionId()" class="text-xs font-normal text-muted-foreground">{{
            description()
          }}</span>
        }
      </span>
    </yuw-switch>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSwitch {
  readonly checked = model(false);
  readonly description = input<string>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly inputId = input(nextUiId('ui-switch'));

  protected descriptionId(): string {
    return `${this.inputId()}-description`;
  }
}

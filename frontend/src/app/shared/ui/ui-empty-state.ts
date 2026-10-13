import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { YuwEmptyImports } from 'yukit-web';

@Component({
  selector: 'ui-empty-state',
  imports: [YuwEmptyImports, NgIcon],
  template: `
    <div yuwEmpty>
      <div yuwEmptyHeader>
        @if (icon(); as iconName) {
          <div yuwEmptyMedia variant="icon"><ng-icon [name]="iconName" /></div>
        }
        <h3 yuwEmptyTitle>{{ title() }}</h3>
        @if (description()) {
          <p yuwEmptyDescription>{{ description() }}</p>
        }
      </div>
      <div yuwEmptyContent>
        <ng-content />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiEmptyState {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly icon = input<string>();
}

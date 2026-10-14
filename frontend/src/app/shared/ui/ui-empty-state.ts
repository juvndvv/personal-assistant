import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { YuwEmptyImports } from 'yukit-web';

@Component({
  selector: 'ui-empty-state',
  imports: [YuwEmptyImports, NgIcon],
  template: `
    <div yuwEmpty class="rounded-card border-0 px-4 py-10">
      <div yuwEmptyHeader>
        @if (icon(); as iconName) {
          <div
            yuwEmptyMedia
            variant="icon"
            class="size-12 rounded-full bg-fill-on-card text-muted-foreground"
          >
            <ng-icon [name]="iconName" size="24" />
          </div>
        }
        <h3 yuwEmptyTitle class="text-base font-semibold text-foreground">{{ title() }}</h3>
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

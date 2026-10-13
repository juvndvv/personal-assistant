import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-foreground">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="mt-1 text-sm text-muted-foreground">{{ subtitle() }}</p>
      }
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}

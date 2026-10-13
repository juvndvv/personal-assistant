import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
} from '@angular/core';

export interface UiTabItem {
  id: string;
  label: string;
}

@Component({
  selector: 'ui-tabs',
  template: `
    <div
      role="tablist"
      [attr.aria-label]="ariaLabel()"
      class="inline-flex w-full gap-1 rounded-xl bg-muted p-1 sm:w-auto"
    >
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          [id]="tabId(tab.id)"
          [attr.aria-selected]="tab.id === active()"
          [attr.aria-controls]="panelId() ?? null"
          [tabIndex]="tab.id === active() ? 0 : -1"
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none"
          [class]="
            tab.id === active()
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          "
          (click)="active.set(tab.id)"
          (keydown)="onKeydown($event)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiTabs {
  readonly tabs = input.required<readonly UiTabItem[]>();
  readonly active = model.required<string>();
  readonly ariaLabel = input<string>();
  readonly panelId = input<string>();
  readonly idPrefix = input('ui-tab');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected tabId(id: string): string {
    return `${this.idPrefix()}-${id}`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const tabs = this.tabs();
    const current = tabs.findIndex((tab) => tab.id === this.active());
    const next = tabs[(current + step + tabs.length) % tabs.length];
    if (next === undefined) {
      return;
    }
    this.active.set(next.id);
    this.host.nativeElement
      .querySelector<HTMLElement>(`#${CSS.escape(this.tabId(next.id))}`)
      ?.focus();
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
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
      class="relative grid w-full auto-cols-fr grid-flow-col gap-1 rounded-capsule bg-muted p-1 dark:bg-grouped sm:inline-grid sm:w-auto"
      [style.--segment-count]="tabs().length"
      [style.--segment-index]="activeIndex()"
    >
      @if (activeIndex() >= 0) {
        <span
          aria-hidden="true"
          class="segment-indicator pointer-events-none absolute inset-y-1 start-1 rounded-capsule bg-card shadow-sm transition-transform duration-[350ms] ease-spring dark:bg-fill-strong"
        ></span>
      }
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          [id]="tabId(tab.id)"
          [attr.aria-selected]="tab.id === active()"
          [attr.aria-controls]="panelId() ?? null"
          [tabIndex]="tab.id === active() ? 0 : -1"
          class="relative min-h-10 rounded-capsule px-4 text-sm whitespace-nowrap transition-colors duration-150"
          [class]="
            tab.id === active()
              ? 'font-semibold text-foreground'
              : 'font-medium text-muted-foreground hover:text-foreground'
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

  protected readonly activeIndex = computed(() =>
    this.tabs().findIndex((tab) => tab.id === this.active()),
  );

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

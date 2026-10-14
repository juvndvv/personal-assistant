import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { PageBackLink, PageChrome } from './page-chrome';

const TOP_BAR_SELECTOR = 'ui-glass-bar[data-position="top"]';

@Component({
  selector: 'app-page-header',
  imports: [NgIcon, RouterLink],
  providers: [provideIcons({ lucideChevronLeft })],
  template: `
    <header class="mb-6">
      @if (back(); as backLink) {
        @if (!chrome.hosted()) {
          <a
            [routerLink]="backLink.link"
            class="-ms-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-capsule px-2 text-[0.9375rem] font-medium text-link hover:bg-hover"
          >
            <ng-icon name="lucideChevronLeft" size="20" aria-hidden="true" />
            {{ backLink.label }}
          </a>
        }
      }
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <h1
            #heading
            class="text-[1.75rem] leading-tight font-semibold tracking-tight text-foreground md:text-3xl"
          >
            {{ title() }}
          </h1>
          @if (subtitle()) {
            <p class="mt-1 text-[0.9375rem] text-muted-foreground">{{ subtitle() }}</p>
          }
        </div>
        <ng-content select="[pageHeaderActions]" />
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly backLink = input<string>();
  readonly backLabel = input('Volver');

  protected readonly chrome = inject(PageChrome);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly destroyRef = inject(DestroyRef);

  protected readonly back = computed<PageBackLink | null>(() => {
    const link = this.backLink();
    return link === undefined ? null : { link, label: this.backLabel() };
  });

  constructor() {
    effect(() => this.chrome.publish(this, { title: this.title(), back: this.back() }));
    this.destroyRef.onDestroy(() => this.chrome.release(this));
    afterNextRender(() => this.observeHeading());
  }

  private observeHeading(): void {
    const Observer = this.window?.IntersectionObserver;
    if (Observer === undefined) {
      return;
    }
    const observer = new Observer(
      ([entry]) => this.chrome.setLargeTitleVisible(this, entry?.isIntersecting ?? true),
      { rootMargin: this.topBarClearance() },
    );
    observer.observe(this.heading().nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private topBarClearance(): string {
    const bottom =
      this.document.querySelector(TOP_BAR_SELECTOR)?.getBoundingClientRect().bottom ?? 0;
    return `-${Math.max(0, Math.round(bottom))}px 0px 0px 0px`;
  }
}

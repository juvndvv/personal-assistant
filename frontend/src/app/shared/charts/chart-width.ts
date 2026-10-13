import { DestroyRef, ElementRef, Signal, afterNextRender, inject, signal } from '@angular/core';

export const DEFAULT_CHART_WIDTH = 320;

export function observeChartWidth(fallback = DEFAULT_CHART_WIDTH): Signal<number> {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const destroyRef = inject(DestroyRef);
  const width = signal(fallback);
  afterNextRender(() => {
    const measure = (measured: number) => {
      if (measured > 0) {
        width.set(Math.round(measured));
      }
    };
    measure(host.nativeElement.clientWidth);
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0));
    observer.observe(host.nativeElement);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return width.asReadonly();
}

import { DOCUMENT, DestroyRef, Signal, inject, signal } from '@angular/core';

export function mediaQuerySignal(query: string): Signal<boolean> {
  const list = inject(DOCUMENT).defaultView?.matchMedia?.(query);
  const matches = signal(list?.matches ?? false);
  if (list !== undefined) {
    const listener = (event: MediaQueryListEvent): void => matches.set(event.matches);
    list.addEventListener('change', listener);
    inject(DestroyRef).onDestroy(() => list.removeEventListener('change', listener));
  }
  return matches.asReadonly();
}

import { DOCUMENT, Signal, effect, inject, signal } from '@angular/core';

const EDITABLE_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';

export function keyboardInsetSignal(active: Signal<boolean>): Signal<number> {
  const inset = signal(0);
  const document = inject(DOCUMENT);
  const view = document.defaultView;
  const viewport = view?.visualViewport ?? null;
  if (view === null || viewport === null) {
    return inset.asReadonly();
  }

  const measure = (): void => {
    const editing = document.activeElement?.matches(EDITABLE_SELECTOR) ?? false;
    const hidden = view.innerHeight - viewport.height - viewport.offsetTop;
    inset.set(editing ? Math.max(0, Math.round(hidden)) : 0);
  };

  effect((onCleanup) => {
    if (!active()) {
      inset.set(0);
      return;
    }
    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);
    onCleanup(() => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
      document.removeEventListener('focusin', measure);
      document.removeEventListener('focusout', measure);
    });
  });

  return inset.asReadonly();
}

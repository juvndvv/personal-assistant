import { ElementRef, Signal, afterRenderEffect, inject } from '@angular/core';
import { UiState } from './ui-types';

export function hintIdFor(controlId: string): string {
  return `${controlId}-hint`;
}

export function syncFieldAccessibility(
  controlId: Signal<string>,
  state: Signal<UiState>,
  hint: Signal<string | undefined>,
): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  afterRenderEffect(() => {
    const control = host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(controlId())}`);
    if (control === null) {
      return;
    }
    toggleAttribute(control, 'aria-invalid', state() === 'error' ? 'true' : null);
    toggleAttribute(control, 'aria-describedby', hint() ? hintIdFor(controlId()) : null);
  });
}

function toggleAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, value);
  }
}

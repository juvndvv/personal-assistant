import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { render } from '@testing-library/angular';
import { keyboardInsetSignal } from './keyboard-inset';

class FakeVisualViewport extends EventTarget {
  height = window.innerHeight;
  offsetTop = 0;

  showKeyboard(keyboardHeight: number): void {
    this.height = window.innerHeight - keyboardHeight;
    this.dispatchEvent(new Event('resize'));
  }
}

@Component({
  selector: 'app-keyboard-inset-host',
  template: `
    <input aria-label="Importe" />
    <button type="button">Guardar</button>
    <output>{{ inset() }}</output>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class KeyboardInsetHost {
  readonly active = signal(true);
  readonly inset = keyboardInsetSignal(this.active);
}

describe('keyboardInsetSignal', () => {
  let viewport: FakeVisualViewport;

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
  });

  async function setup() {
    const view = await render(KeyboardInsetHost);
    const host = view.fixture.componentInstance;
    const element = view.fixture.nativeElement as HTMLElement;
    return { host, view, element };
  }

  it('reports the height the on-screen keyboard covers while a field has focus', async () => {
    const { host, element } = await setup();

    element.querySelector('input')?.focus();
    viewport.showKeyboard(336);

    expect(host.inset()).toBe(336);
  });

  it('accounts for the visual viewport being scrolled up', async () => {
    const { host, element } = await setup();

    element.querySelector('input')?.focus();
    viewport.offsetTop = 40;
    viewport.showKeyboard(336);

    expect(host.inset()).toBe(296);
  });

  it('ignores viewport changes when no editable field has focus', async () => {
    const { host, element } = await setup();

    element.querySelector('button')?.focus();
    viewport.showKeyboard(336);

    expect(host.inset()).toBe(0);
  });

  it('drops the inset once the field loses focus or the host deactivates', async () => {
    const { host, view, element } = await setup();
    const field = element.querySelector('input');

    field?.focus();
    viewport.showKeyboard(336);
    field?.blur();
    expect(host.inset()).toBe(0);

    field?.focus();
    expect(host.inset()).toBe(336);
    host.active.set(false);
    view.fixture.detectChanges();
    expect(host.inset()).toBe(0);
  });
});

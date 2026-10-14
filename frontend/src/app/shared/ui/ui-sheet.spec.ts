import { InteractivityChecker } from '@angular/cdk/a11y';
import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { UiSheet } from './ui-sheet';

function stubViewport(desktop: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: desktop,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

const layoutAwareChecker: Pick<
  InteractivityChecker,
  'isDisabled' | 'isVisible' | 'isTabbable' | 'isFocusable'
> = {
  isDisabled: (element) => element.hasAttribute('disabled'),
  isVisible: () => true,
  isTabbable: (element) => element.matches('input, button, [tabindex]:not([tabindex="-1"])'),
  isFocusable: (element) => element.matches('input, button, [tabindex]'),
};

async function openSheet(side?: string): Promise<HTMLElement> {
  const open = signal(true);
  const sideAttribute = side === undefined ? '' : `side="${side}"`;
  await render(
    `<ui-sheet title="Nuevo" ${sideAttribute} [(open)]="open"><p>Cuerpo</p><input aria-label="Importe" /></ui-sheet>`,
    {
      imports: [UiSheet],
      componentProperties: { open },
      providers: [{ provide: InteractivityChecker, useValue: layoutAwareChecker }],
    },
  );
  await screen.findByText('Cuerpo');
  const panel = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
  if (panel === null) {
    throw new Error('sheet panel not rendered');
  }
  return panel;
}

describe('UiSheet', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens from the bottom on mobile by default', async () => {
    stubViewport(false);

    const panel = await openSheet();

    expect(panel).toHaveAttribute('data-side', 'bottom');
    expect(panel.className).toContain('rounded-t-sheet');
  });

  it('opens from the right as a floating panel on desktop by default', async () => {
    stubViewport(true);

    const panel = await openSheet();

    expect(panel).toHaveAttribute('data-side', 'right');
    expect(panel.className).toContain('rounded-sheet-floating');
  });

  it('keeps the floating panel clear of the top and bottom safe areas', async () => {
    stubViewport(true);

    const panel = await openSheet();

    expect(panel.className).toContain(
      'data-[side=right]:top-[calc(env(safe-area-inset-top)+0.75rem)]',
    );
    expect(panel.className).toContain(
      'data-[side=right]:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]',
    );
    expect(panel.className).not.toContain('inset-y-3');
  });

  it('focuses the sheet body instead of its first field when it opens', async () => {
    stubViewport(false);

    await openSheet();

    await vi.waitFor(() => expect(screen.getByTestId('sheet-body')).toHaveFocus());
    expect(screen.getByRole('textbox', { name: 'Importe' })).not.toHaveFocus();
  });

  it('honours an explicit side', async () => {
    stubViewport(true);

    expect(await openSheet('bottom')).toHaveAttribute('data-side', 'bottom');
  });
});

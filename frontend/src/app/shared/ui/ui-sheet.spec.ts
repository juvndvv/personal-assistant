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

async function openSheet(side?: string): Promise<HTMLElement> {
  const open = signal(true);
  const sideAttribute = side === undefined ? '' : `side="${side}"`;
  await render(
    `<ui-sheet title="Nuevo" ${sideAttribute} [(open)]="open"><p>Cuerpo</p></ui-sheet>`,
    {
      imports: [UiSheet],
      componentProperties: { open },
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

  it('honours an explicit side', async () => {
    stubViewport(true);

    expect(await openSheet('bottom')).toHaveAttribute('data-side', 'bottom');
  });
});

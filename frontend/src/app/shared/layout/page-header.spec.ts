import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { PageChrome } from './page-chrome';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title, subtitle and an inline back link outside the shell', async () => {
    await render(
      `<app-page-header title="Ajustes" subtitle="Preferencias" backLink="/mas" backLabel="Más" />`,
      { imports: [PageHeader], providers: [provideRouter([])] },
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument();
    expect(screen.getByText('Preferencias')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Más' })).toHaveAttribute('href', '/mas');
  });

  it('hands the back link to the shell top bar when hosted', async () => {
    const chrome = new PageChrome();
    chrome.attachHost();

    await render(`<app-page-header title="Ajustes" backLink="/mas" backLabel="Más" />`, {
      imports: [PageHeader],
      providers: [provideRouter([]), { provide: PageChrome, useValue: chrome }],
    });

    expect(screen.queryByRole('link', { name: 'Más' })).not.toBeInTheDocument();
    expect(chrome.state()).toEqual({ title: 'Ajustes', back: { link: '/mas', label: 'Más' } });
  });

  it('releases the chrome state when destroyed', async () => {
    const chrome = new PageChrome();
    const { fixture } = await render(`<app-page-header title="Informes" />`, {
      imports: [PageHeader],
      providers: [provideRouter([]), { provide: PageChrome, useValue: chrome }],
    });
    expect(chrome.state()?.title).toBe('Informes');

    fixture.destroy();

    expect(chrome.state()).toBeNull();
  });

  it('hides the large title only once it scrolls under the measured top bar', async () => {
    const topBar = document.createElement('ui-glass-bar');
    topBar.setAttribute('data-position', 'top');
    vi.spyOn(topBar, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 103 }),
    );
    document.body.append(topBar);
    const rootMargins: (string | undefined)[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          rootMargins.push(options?.rootMargin);
        }
        observe(): void {
          return undefined;
        }
        disconnect(): void {
          return undefined;
        }
      },
    );

    await render(`<app-page-header title="Pendientes" />`, {
      imports: [PageHeader],
      providers: [provideRouter([])],
    });

    expect(rootMargins).toEqual(['-103px 0px 0px 0px']);
    topBar.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

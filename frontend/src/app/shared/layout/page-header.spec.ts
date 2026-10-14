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
});

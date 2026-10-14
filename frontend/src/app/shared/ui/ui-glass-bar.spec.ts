import { render, screen } from '@testing-library/angular';
import { UiGlassBar } from './ui-glass-bar';

describe('UiGlassBar', () => {
  it('renders a sticky top bar that clears the safe area', async () => {
    await render(`<ui-glass-bar data-testid="bar"><h2>Título</h2></ui-glass-bar>`, {
      imports: [UiGlassBar],
    });

    const bar = screen.getByTestId('bar');
    expect(bar).toHaveAttribute('data-position', 'top');
    expect(bar.className).toContain('glass');
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('pt-[env(safe-area-inset-top)]');
    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument();
  });

  it('pins a bottom bar above the shell tab bar', async () => {
    await render(`<ui-glass-bar position="bottom" data-testid="bar">Confirmar</ui-glass-bar>`, {
      imports: [UiGlassBar],
    });

    const bar = screen.getByTestId('bar');
    expect(bar).toHaveAttribute('data-position', 'bottom');
    expect(bar.className).toContain('bottom-[var(--shell-bottom-inset)]');
  });

  it('floats as a rounded capsule without sticking when asked', async () => {
    await render(
      `<ui-glass-bar position="bottom" floating [sticky]="false" data-testid="bar">Acciones</ui-glass-bar>`,
      { imports: [UiGlassBar] },
    );

    const bar = screen.getByTestId('bar');
    expect(bar.className).toContain('rounded-sheet-floating');
    expect(bar.className).not.toContain('sticky');
  });
});

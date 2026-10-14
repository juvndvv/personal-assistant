import { render, screen } from '@testing-library/angular';
import { UiCard } from './ui-card';

describe('UiCard', () => {
  it('renders an elevated card with default padding', async () => {
    await render(`<ui-card data-testid="card">Saldo</ui-card>`, { imports: [UiCard] });

    const card = screen.getByTestId('card');
    expect(card).toHaveTextContent('Saldo');
    expect(card.className).toContain('rounded-card');
    expect(card.className).toContain('bg-card');
    expect(card.className).toContain('p-4');
  });

  it('applies to any element and keeps its own classes', async () => {
    await render(`<section uiCard padding="lg" class="mt-6" data-testid="card">Resumen</section>`, {
      imports: [UiCard],
    });

    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('SECTION');
    expect(card.className).toContain('mt-6');
    expect(card.className).toContain('p-5');
  });

  it('drops padding and divides rows for lists', async () => {
    await render(`<ul uiCard divided data-testid="card"><li>A</li><li>B</li></ul>`, {
      imports: [UiCard],
    });

    const card = screen.getByTestId('card');
    expect(card.className).toContain('divide-y');
    expect(card.className).not.toContain('p-4');
  });

  it('supports grouped and tinted variants', async () => {
    await render(
      `<ui-card variant="grouped" data-testid="grouped" /><ui-card variant="tinted" data-testid="tinted" />`,
      { imports: [UiCard] },
    );

    expect(screen.getByTestId('grouped').className).toContain('bg-grouped');
    expect(screen.getByTestId('tinted').className).toContain('bg-muted');
  });
});

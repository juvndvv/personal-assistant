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
    expect(screen.getByTestId('tinted').className).toContain('bg-fill-on-card');
  });

  it('keeps tinted cards visible when nested in dark elevated cards', async () => {
    await render(`<ui-card variant="tinted" data-testid="tinted" />`, { imports: [UiCard] });

    expect(screen.getByTestId('tinted').classList).toContain('bg-fill-on-card');
    expect(screen.getByTestId('tinted').className).not.toContain('bg-muted');
  });

  it('insets focus rings inside divided cards so overflow clipping keeps them visible', async () => {
    await render(`<ui-card divided data-testid="card"><a href="/">Fila</a></ui-card>`, {
      imports: [UiCard],
    });

    expect(screen.getByTestId('card').classList).toContain('overflow-hidden');
    expect(screen.getByTestId('card').classList).toContain('[&_:focus-visible]:-outline-offset-2');
  });

  it('is a block by default', async () => {
    await render(`<ui-card data-testid="card" />`, { imports: [UiCard] });

    expect(screen.getByTestId('card').classList).toContain('block');
  });

  it('leaves display to the consumer when it sets a layout class', async () => {
    await render(`<section uiCard class="flex flex-col" data-testid="card">A</section>`, {
      imports: [UiCard],
    });

    const card = screen.getByTestId('card');
    expect(card.classList).toContain('flex');
    expect(card.classList).not.toContain('block');
  });

  it('keeps block when the consumer only sets responsive layout classes', async () => {
    await render(`<section uiCard class="md:grid" data-testid="card">A</section>`, {
      imports: [UiCard],
    });

    expect(screen.getByTestId('card').classList).toContain('block');
  });
});

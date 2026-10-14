import { render, screen } from '@testing-library/angular';
import { UiButtonLink } from './ui-button-link';

describe('UiButtonLink', () => {
  it('renders an anchor as a primary capsule by default', async () => {
    await render(`<a uiButtonLink href="/mas/fijos/nuevo">Nuevo fijo</a>`, {
      imports: [UiButtonLink],
    });

    const link = screen.getByRole('link', { name: 'Nuevo fijo' });
    expect(link).toHaveAttribute('href', '/mas/fijos/nuevo');
    expect(link.className).toContain('rounded-capsule');
    expect(link.className).toContain('bg-primary');
    expect(link.className).toContain('min-h-11');
  });

  it('supports outline variant, size and full width while keeping consumer classes', async () => {
    await render(
      `<a uiButtonLink variant="outline" size="sm" fullWidth class="mt-2" href="/x">CSV</a>`,
      { imports: [UiButtonLink] },
    );

    const link = screen.getByRole('link', { name: 'CSV' });
    expect(link.className).toContain('border-border');
    expect(link.className).not.toContain('bg-primary');
    expect(link.className).toContain('min-h-9');
    expect(link.className).toContain('w-full');
    expect(link.className).toContain('mt-2');
  });
});

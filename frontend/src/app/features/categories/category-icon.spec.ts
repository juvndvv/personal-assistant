import { render } from '@testing-library/angular';
import { CategoryIcon } from './category-icon';

describe('CategoryIcon', () => {
  it('tints itself with the category palette variable', async () => {
    const { container } = await render(
      `<app-category-icon icon="house" color="#2E7D32" size="sm" />`,
      { imports: [CategoryIcon] },
    );

    const host = container.querySelector<HTMLElement>('app-category-icon');
    expect(host).toHaveAttribute('aria-hidden', 'true');
    expect(host?.style.getPropertyValue('--category-color')).toBe('var(--category-green)');
    expect(host?.className).toContain('size-8');
  });

  it('stays neutral without a colour', async () => {
    const { container } = await render(`<app-category-icon />`, { imports: [CategoryIcon] });

    const host = container.querySelector<HTMLElement>('app-category-icon');
    expect(host?.style.getPropertyValue('--category-color')).toBe('');
  });
});

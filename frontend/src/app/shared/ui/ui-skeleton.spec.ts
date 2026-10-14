import { render, screen } from '@testing-library/angular';
import { UiSkeleton, UiSkeletonList } from './ui-skeleton';

describe('UiSkeleton', () => {
  it('is hidden from assistive technology', async () => {
    const { container } = await render(`<ui-skeleton />`, { imports: [UiSkeleton] });

    expect(container.querySelector('ui-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByTestId('skeleton-bone')).toHaveLength(1);
  });

  it('renders one bone per line and shortens the last one', async () => {
    await render(`<ui-skeleton [lines]="3" />`, { imports: [UiSkeleton] });

    const bones = screen.getAllByTestId('skeleton-bone');
    expect(bones).toHaveLength(3);
    expect(bones[2]?.style.width).toBe('60%');
  });

  it('accepts explicit sizes', async () => {
    await render(`<ui-skeleton shape="block" width="10rem" height="4rem" />`, {
      imports: [UiSkeleton],
    });

    const bone = screen.getByTestId('skeleton-bone');
    expect(bone.style.width).toBe('10rem');
    expect(bone.style.height).toBe('4rem');
  });
});

describe('UiSkeletonList', () => {
  it('exposes a labelled loading status with the requested rows', async () => {
    const { container } = await render(
      `<ui-skeleton-list label="Cargando movimientos" [rows]="3" />`,
      { imports: [UiSkeletonList] },
    );

    expect(screen.getByRole('status')).toHaveTextContent('Cargando movimientos');
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });
});

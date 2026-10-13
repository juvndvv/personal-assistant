import { signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import { UiDateInput } from './ui-date-input';

describe('UiDateInput', () => {
  it('binds ISO date strings both ways without Date objects', async () => {
    const date = signal<string | null>('2026-10-13');
    await render(`<ui-date-input label="Fecha" [(value)]="date" />`, {
      imports: [UiDateInput],
      componentProperties: { date },
    });
    const input = screen.getByLabelText(/fecha/i);
    expect(input).toHaveValue('2026-10-13');

    fireEvent.input(input, { target: { value: '2026-12-31' } });
    expect(date()).toBe('2026-12-31');

    fireEvent.input(input, { target: { value: '' } });
    expect(date()).toBeNull();
  });
});

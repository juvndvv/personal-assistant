import { render, screen } from '@testing-library/angular';
import { UiField } from './ui-field';

describe('UiField', () => {
  it('renders the label text without surrounding whitespace', async () => {
    await render(`<ui-field controlId="name" label="Nombre"><input id="name" /></ui-field>`, {
      imports: [UiField],
    });

    expect(screen.getByText('Nombre', { selector: 'label' }).textContent).toBe('Nombre');
    expect(screen.getByLabelText(/^Nombre$/)).toHaveAttribute('id', 'name');
  });

  it('keeps the hidden required marker out of the label text', async () => {
    await render(
      `<ui-field controlId="name" label="Nombre" [required]="true"><input id="name" /></ui-field>`,
      { imports: [UiField] },
    );

    const label = document.querySelector('label');
    expect(label?.textContent).toBe('Nombre');
    expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('*');
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveAttribute('id', 'name');
  });
});

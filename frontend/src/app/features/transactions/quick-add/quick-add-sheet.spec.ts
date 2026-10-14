import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import { Category, QuickAddDefaults } from '../../../core/api/models';
import { QuickAddApi } from '../../../core/api/quick-add.api';
import { TagsApi } from '../../../core/api/tags.api';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { AuthStore } from '../../../core/auth/auth.store';
import { todayInMadrid } from '../../../core/date/iso-date';
import { AppUpdates } from '../../../core/pwa/app-updates';
import { UiToast } from '../../../shared/ui';
import { anAccount } from '../../accounts/testing/account-fixtures';
import { ShellLayout } from '../../shell/shell.layout';
import { MovementSheets } from '../movement-sheets';
import { aTransaction } from '../testing/transaction-fixtures';
import { AttachmentsApi } from '../../../core/api/attachments.api';
import { DraftsApi } from '../../../core/api/drafts.api';
import { quietAttachmentsApi, quietDraftsApi } from '../../drafts/testing/draft-fixtures';
import { SuggestionsApi } from '../../../core/api/suggestions.api';
import { aSuggestion, quietSuggestionsApi } from '../testing/suggestion-fakes';

function category(
  id: number,
  name: string,
  kind: Category['kind'],
  children: Category[] = [],
): Category {
  return {
    id,
    kind,
    name,
    parent_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    archived_at: null,
    children,
  };
}

const TREE: Category[] = [
  category(10, 'Alimentación', 'expense', [
    { ...category(11, 'Supermercado', 'expense'), parent_id: 10 },
    { ...category(12, 'Restaurantes', 'expense'), parent_id: 10 },
  ]),
  category(20, 'Transporte', 'expense'),
  category(50, 'Nómina', 'income'),
];

const DEFAULTS: QuickAddDefaults = {
  date: '2026-10-13',
  account_id: 3,
  frequent_category_ids: { expense: [11, 20, 12], income: [50] },
};

async function setup(
  defaults$: Observable<QuickAddDefaults> = of(DEFAULTS),
  suggestionsApi: Partial<SuggestionsApi> = quietSuggestionsApi(),
) {
  const transactionsApi = {
    create: vi.fn(() => of(aTransaction({ id: 501 }))),
    delete: vi.fn(() => of(undefined)),
    list: vi.fn(),
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const view = await render(ShellLayout, {
    providers: [
      { provide: DraftsApi, useValue: quietDraftsApi() },
      { provide: AttachmentsApi, useValue: quietAttachmentsApi() },
      provideRouter([]),
      { provide: AuthStore, useValue: { user: signal(null), logout: vi.fn() } },
      {
        provide: AppUpdates,
        useValue: { updateReady: signal(false), reloadRequired: signal(false), reload: vi.fn() },
      },
      { provide: QuickAddApi, useValue: { defaults: vi.fn(() => defaults$) } },
      {
        provide: AccountsApi,
        useValue: {
          list: vi.fn(() =>
            of([
              anAccount({ id: 3, name: 'BBVA' }),
              anAccount({ id: 4, name: 'Efectivo', type: 'cash' }),
            ]),
          ),
        },
      },
      { provide: CategoriesApi, useValue: { list: vi.fn(() => of(TREE)) } },
      { provide: TagsApi, useValue: { list: vi.fn(() => of([])) } },
      { provide: TransactionsApi, useValue: transactionsApi },
      { provide: SuggestionsApi, useValue: suggestionsApi },
      { provide: UiToast, useValue: toast },
    ],
  });
  const sheets = view.fixture.debugElement.injector.get(MovementSheets);
  const user = userEvent.setup();
  let taps = 0;
  const tap = async (element: Element) => {
    taps += 1;
    await user.click(element);
  };
  return { transactionsApi, toast, sheets, user, tap, taps: () => taps };
}

function plusButton(): HTMLElement {
  const buttons = screen.getAllByRole('button', { name: 'Añadir movimiento' });
  return buttons[buttons.length - 1] as HTMLElement;
}

describe('Quick add', () => {
  it('saves an expense with defaults in 3 taps: +, category, Guardar', async () => {
    const { transactionsApi, sheets, tap, taps, user } = await setup();

    await tap(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    const amount = within(dialog).getByRole('textbox', { name: /importe/i });
    await vi.waitFor(() => expect(amount).toHaveFocus());
    await user.keyboard('12,50');
    await tap(await within(dialog).findByRole('button', { name: 'Supermercado' }));
    await tap(within(document.body).getByRole('button', { name: 'Guardar' }));

    expect(taps()).toBe(3);
    expect(transactionsApi.create).toHaveBeenCalledWith({
      type: 'expense',
      amount_cents: 1250,
      category_id: 11,
      date: '2026-10-13',
      account_id: 3,
      description: null,
      merchant: null,
      note: null,
    });
    expect(sheets.changes()).toBe(1);
    expect(sheets.quickAddOpen()).toBe(false);
  });

  it('prefills today and the default account and shows frequent categories per type', async () => {
    const { user } = await setup();

    await user.click(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });

    expect(await within(dialog).findByTestId('quick-add-summary')).toHaveTextContent(/· BBVA$/);
    const chips = within(within(dialog).getByTestId('quick-add-categories')).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual([
      'Supermercado',
      'Transporte',
      'Restaurantes',
    ]);
    expect(within(dialog).getByRole('radio', { name: 'Gasto' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(within(dialog).getByRole('radio', { name: 'Ingreso' }));
    const incomeChips = within(within(dialog).getByTestId('quick-add-categories')).getAllByRole(
      'button',
    );
    expect(incomeChips.map((chip) => chip.textContent?.trim())).toEqual(['Nómina']);

    await user.click(within(dialog).getByRole('button', { name: 'Más detalles' }));
    expect(within(dialog).getByLabelText('Fecha')).toHaveValue('2026-10-13');
    expect(within(dialog).getByRole('combobox', { name: /cuenta/i })).toHaveValue('3');
  });

  it('offers undo after saving', async () => {
    const { transactionsApi, toast, user } = await setup();

    await user.click(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '3');
    await user.click(await within(dialog).findByRole('button', { name: 'Transporte' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(toast.success).toHaveBeenCalledWith(
      'Gasto guardado',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Deshacer' }) }),
    );
    const [, options] = toast.success.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await vi.waitFor(() => expect(transactionsApi.delete).toHaveBeenCalledWith(501));
  });

  it('requires an amount and a category before calling the API', async () => {
    const { transactionsApi, user } = await setup();

    await user.click(plusButton());
    await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(transactionsApi.create).not.toHaveBeenCalled();
    expect(screen.getByText('Indica un importe mayor que cero.')).toBeInTheDocument();
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument();
  });

  it('lets the server apply account and date when saving before defaults arrive', async () => {
    const { transactionsApi, user } = await setup(new Subject<QuickAddDefaults>());

    await user.click(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '9');
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Otra categoría', hidden: true }),
      '20',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.queryByText('Elige una cuenta.')).not.toBeInTheDocument();
    expect(transactionsApi.create).toHaveBeenCalledWith({
      type: 'expense',
      amount_cents: 900,
      category_id: 20,
      date: todayInMadrid(),
      description: null,
      merchant: null,
      note: null,
    });
  });

  it('keeps a date picked before late defaults arrive', async () => {
    const defaults$ = new Subject<QuickAddDefaults>();
    const { transactionsApi, user } = await setup(defaults$);

    await user.click(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await user.click(within(dialog).getByRole('button', { name: 'Más detalles' }));
    fireEvent.input(within(dialog).getByLabelText(/fecha/i), { target: { value: '2026-09-30' } });
    defaults$.next(DEFAULTS);
    defaults$.complete();
    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '5');
    await user.click(await within(dialog).findByRole('button', { name: 'Transporte' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(transactionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-09-30', account_id: 3 }),
    );
  });

  it('sends details and tags and shows server validation on the field', async () => {
    const { transactionsApi, user } = await setup();
    transactionsApi.create.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { message: 'x', errors: { date: ['La fecha no puede ser anterior.'] } },
          }),
      ),
    );

    await user.click(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '20');
    await user.click(await within(dialog).findByRole('button', { name: 'Restaurantes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Más detalles' }));
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^cuenta/i }), '4');
    await user.type(within(dialog).getByRole('textbox', { name: 'Descripción' }), 'Cena');
    await user.type(within(dialog).getByRole('combobox', { name: 'Etiquetas' }), 'Roma{Enter}');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(transactionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 4,
        category_id: 12,
        description: 'Cena',
        tags: ['roma'],
      }),
    );
    expect(await within(dialog).findByText('La fecha no puede ser anterior.')).toBeInTheDocument();
  });
});

describe('Quick add suggestions from history', () => {
  async function openDetails(user: ReturnType<typeof userEvent.setup>) {
    await user.click(plusButton());
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
    await within(dialog).findByRole('button', { name: 'Supermercado' });
    await user.click(within(dialog).getByRole('button', { name: 'Más detalles' }));
    return dialog;
  }

  function pressed(dialog: HTMLElement, name: string): string | null {
    return within(dialog).getByRole('button', { name }).getAttribute('aria-pressed');
  }

  it('fills category and account from the merchant when the user has not touched them', async () => {
    const suggestionsApi = { categorization: vi.fn(() => of(aSuggestion())) };
    const { transactionsApi, user } = await setup(of(DEFAULTS), suggestionsApi);
    const dialog = await openDetails(user);

    await user.type(within(dialog).getByRole('textbox', { name: 'Comercio' }), 'Mercadona');
    await user.tab();

    expect(suggestionsApi.categorization).toHaveBeenCalledWith({
      type: 'expense',
      merchant: 'Mercadona',
      description: '',
    });
    await vi.waitFor(() => expect(pressed(dialog, 'Supermercado')).toBe('true'));
    expect(within(dialog).getByRole('combobox', { name: /^cuenta/i })).toHaveValue('4');
    expect(within(dialog).getByTestId('history-suggestion')).toHaveTextContent(
      'Sugerido por tu historial',
    );

    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '7');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(transactionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 11, account_id: 4, merchant: 'Mercadona' }),
    );
  });

  it('never overrides a category or an account picked by the user', async () => {
    const suggestionsApi = { categorization: vi.fn(() => of(aSuggestion())) };
    const { user } = await setup(of(DEFAULTS), suggestionsApi);
    const dialog = await openDetails(user);

    await user.click(within(dialog).getByRole('button', { name: 'Transporte' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Comercio' }), 'Mercadona');
    await user.tab();

    await vi.waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: /^cuenta/i })).toHaveValue('4'),
    );
    expect(pressed(dialog, 'Transporte')).toBe('true');
    expect(pressed(dialog, 'Supermercado')).toBe('false');

    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^cuenta/i }), '3');
    expect(within(dialog).queryByTestId('history-suggestion')).not.toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Descripción' }), 'Compra');
    await user.tab();

    expect(suggestionsApi.categorization).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('combobox', { name: /^cuenta/i })).toHaveValue('3');
  });

  it('looks up the description too and keeps the form unchanged without a hint', async () => {
    const suggestionsApi = { categorization: vi.fn(() => of(null)) };
    const { user } = await setup(of(DEFAULTS), suggestionsApi);
    const dialog = await openDetails(user);

    await user.type(within(dialog).getByRole('textbox', { name: 'Descripción' }), 'Gasolina');
    await user.tab();
    await user.tab();

    expect(suggestionsApi.categorization).toHaveBeenCalledTimes(1);
    expect(suggestionsApi.categorization).toHaveBeenCalledWith({
      type: 'expense',
      merchant: '',
      description: 'Gasolina',
    });
    expect(within(dialog).getByRole('combobox', { name: /^cuenta/i })).toHaveValue('3');
    expect(within(dialog).queryByTestId('history-suggestion')).not.toBeInTheDocument();
  });

  it('reverts history-filled category and account when the merchant changes to one without a hint', async () => {
    const suggestionsApi = {
      categorization: vi.fn((query: { merchant: string }) =>
        of(query.merchant === 'Mercadona' ? aSuggestion() : null),
      ),
    };
    const { transactionsApi, user } = await setup(of(DEFAULTS), suggestionsApi);
    const dialog = await openDetails(user);
    const merchant = within(dialog).getByRole('textbox', { name: 'Comercio' });

    await user.type(merchant, 'Mercadona');
    await user.tab();
    await vi.waitFor(() => expect(pressed(dialog, 'Supermercado')).toBe('true'));

    await user.clear(merchant);
    await user.type(merchant, 'Zara');
    await user.tab();

    await vi.waitFor(() => expect(pressed(dialog, 'Supermercado')).toBe('false'));
    expect(within(dialog).getByRole('combobox', { name: /^cuenta/i })).toHaveValue('3');
    expect(within(dialog).queryByTestId('history-suggestion')).not.toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '7');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(transactionsApi.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 11 }),
    );
  });
});

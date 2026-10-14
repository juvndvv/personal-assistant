import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import { DraftsApi } from '../../../core/api/drafts.api';
import { Category, Draft } from '../../../core/api/models';
import { TagsApi } from '../../../core/api/tags.api';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { TransfersApi } from '../../../core/api/transfers.api';
import { UiToast } from '../../../shared/ui';
import { anAccount } from '../../accounts/testing/account-fixtures';
import { MovementSheets } from '../../transactions/movement-sheets';
import { aTransaction, aTransfer } from '../../transactions/testing/transaction-fixtures';
import { PendingDrafts } from '../pending-drafts';
import { aCapture, aDraft, aDraftPage, anAttachment } from '../testing/draft-fixtures';
import { REFERENCE_LOAD_FAILED_MESSAGE } from '../../transactions/reference-load-alert';
import { DraftReviewPage, REVIEW_MESSAGES } from './draft-review.page';

function category(id: number, name: string, kind: Category['kind']): Category {
  return {
    id,
    kind,
    name,
    parent_id: null,
    icon: null,
    color: null,
    sort_order: 0,
    archived_at: null,
    children: [],
  };
}

const TREE: Category[] = [
  category(11, 'Supermercado', 'expense'),
  category(20, 'Transporte', 'expense'),
  category(50, 'Nómina', 'income'),
];

async function setup(draft: Draft, remaining = 0) {
  const draftsApi = {
    get: vi.fn(() => of(draft)),
    list: vi.fn(() => of(aDraftPage([], remaining))),
    discard: vi.fn(() => of({ ...draft, status: 'discarded' as const })),
  };
  const transactionsApi = { create: vi.fn(() => of(aTransaction({ id: 600 }))) };
  const transfersApi = { create: vi.fn(() => of(aTransfer({ id: 70 }))) };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const view = await render(DraftReviewPage, {
    providers: [
      provideRouter([]),
      { provide: DraftsApi, useValue: draftsApi },
      { provide: TransactionsApi, useValue: transactionsApi },
      { provide: TransfersApi, useValue: transfersApi },
      {
        provide: AccountsApi,
        useValue: {
          list: vi.fn(() =>
            of([
              anAccount({ id: 3, name: 'BBVA' }),
              anAccount({ id: 7, name: 'Visa', type: 'credit_card' }),
              anAccount({ id: 9, name: 'Ahorro', type: 'savings_investment' }),
            ]),
          ),
        },
      },
      { provide: CategoriesApi, useValue: { list: vi.fn(() => of(TREE)) } },
      { provide: TagsApi, useValue: { list: vi.fn(() => of([])) } },
      { provide: UiToast, useValue: toast },
    ],
    inputs: { id: String(draft.id) },
  });
  const injector = view.fixture.debugElement.injector;
  const navigate = vi.spyOn(injector.get(Router), 'navigate').mockResolvedValue(true);
  await screen.findByRole('form', { name: 'Borrador del movimiento' });
  await vi.waitFor(() =>
    expect(screen.getByRole('combobox', { name: /^(cuenta|desde)/i })).toHaveValue(
      String(draft.proposal.account_id),
    ),
  );
  return {
    draftsApi,
    transactionsApi,
    transfersApi,
    toast,
    navigate,
    user: userEvent.setup(),
    sheets: injector.get(MovementSheets),
    pending: injector.get(PendingDrafts),
  };
}

function fieldContainer(field: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`app-review-field[data-field="${field}"]`);
  if (element === null) {
    throw new Error(`Field ${field} not rendered`);
  }
  return element;
}

describe('DraftReviewPage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('prefills the form from the proposal', async () => {
    await setup(aDraft());

    expect(screen.getByRole('textbox', { name: /importe/i })).toHaveValue('20,00');
    expect(screen.getByRole('combobox', { name: /^cuenta/i })).toHaveValue('7');
    expect(screen.getByLabelText(/fecha/i)).toHaveValue('2026-10-12');
    expect(screen.getByRole('textbox', { name: 'Comercio' })).toHaveValue('Mercadona');
    expect(screen.getByRole('radio', { name: 'Gasto' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('draft-transcript')).toHaveTextContent(
      'Veinte euros en Mercadona con la Visa',
    );
    expect(screen.getByTestId('draft-audio')).toHaveAttribute(
      'src',
      '/api/v1/attachments/01JAUDIO0000000000000000001',
    );
  });

  it('abbreviates the transfer segment on narrow screens', async () => {
    await setup(aDraft());

    expect(screen.getByRole('radio', { name: 'Transf.' })).toBeInTheDocument();
  });

  it('highlights low-confidence fields with the warning state and an icon', async () => {
    await setup(aDraft({ low_confidence_fields: ['category_id', 'date'] }));

    const categoryField = fieldContainer('category_id');
    expect(categoryField).toHaveAttribute('data-low-confidence', 'true');
    expect(categoryField).toHaveClass('ring-warning');
    expect(within(categoryField).getByText('Revisa este dato')).toBeVisible();
    expect(within(categoryField).getByRole('combobox')).toHaveClass('border-warning');
    expect(fieldContainer('date')).toHaveAttribute('data-low-confidence', 'true');
    expect(within(categoryField).getByTestId('field-source-base')).toHaveClass('bg-card');

    const amountField = fieldContainer('amount_cents');
    expect(amountField).toHaveAttribute('data-low-confidence', 'false');
    expect(within(amountField).queryByText('Revisa este dato')).not.toBeInTheDocument();
  });

  it('describes each flagged control with the low-confidence warning', async () => {
    await setup(aDraft({ low_confidence_fields: ['category_id', 'type'] }));

    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: /categoría/i })).toHaveAccessibleDescription(
        'Revisa este dato',
      ),
    );
    expect(
      screen.getByRole('radiogroup', { name: 'Tipo de movimiento' }),
    ).toHaveAccessibleDescription('Revisa este dato');
    expect(screen.getByRole('combobox', { name: /cuenta/i })).not.toHaveAccessibleDescription(
      /Revisa este dato/,
    );
  });

  it('shows where each value came from', async () => {
    await setup(aDraft());

    expect(within(fieldContainer('amount_cents')).getByTestId('field-source')).toHaveTextContent(
      'IA',
    );
    expect(within(fieldContainer('date')).getByTestId('field-source')).toHaveTextContent(
      'Por defecto',
    );
  });

  it('marks values learned from previous corrections as coming from history', async () => {
    await setup(
      aDraft({
        field_sources: { amount_cents: 'ai', category_id: 'history', account_id: 'history' },
      }),
    );

    expect(within(fieldContainer('category_id')).getByTestId('field-source')).toHaveTextContent(
      'De tu historial',
    );
    expect(within(fieldContainer('account_id')).getByTestId('field-source')).toHaveTextContent(
      'De tu historial',
    );
    expect(within(fieldContainer('amount_cents')).getByTestId('field-source')).toHaveTextContent(
      'IA',
    );
  });

  it('clears the highlight once the user changes the flagged value', async () => {
    const { user } = await setup(aDraft({ low_confidence_fields: ['category_id'] }));

    const category = screen.getByRole('combobox', { name: /categoría/i });
    await user.selectOptions(category, '20');

    expect(fieldContainer('category_id')).toHaveAttribute('data-low-confidence', 'false');
    await vi.waitFor(() => expect(category).not.toHaveAttribute('aria-describedby'));
  });

  it('confirms an expense with draft_id and tags, then leaves for the movements list', async () => {
    const { transactionsApi, toast, navigate, sheets, user } = await setup(aDraft());

    await user.selectOptions(screen.getByRole('combobox', { name: /categoría/i }), '20');
    await user.type(screen.getByRole('combobox', { name: 'Etiquetas' }), 'Casa{Enter}');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(transactionsApi.create).toHaveBeenCalledWith({
      type: 'expense',
      amount_cents: 2000,
      category_id: 20,
      date: '2026-10-12',
      account_id: 7,
      description: 'Mercadona',
      merchant: 'Mercadona',
      tags: ['casa'],
      draft_id: 88,
    });
    expect(toast.success).toHaveBeenCalledWith('Movimiento guardado', expect.anything());
    expect(sheets.changes()).toBe(1);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/movimientos']));
  });

  it('returns to the inbox after confirming when more drafts are pending', async () => {
    const { navigate, user } = await setup(aDraft(), 2);

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/pendientes']));
  });

  it('confirms a transfer draft through POST /transfers', async () => {
    const draft = aDraft({
      proposal: {
        type: 'transfer',
        amount_cents: 10000,
        date: '2026-10-01',
        account_id: 3,
        to_account_id: 9,
        category_id: null,
        description: 'Ahorro mensual',
        merchant: null,
      },
      low_confidence_fields: [],
    });
    const { transfersApi, transactionsApi, user } = await setup(draft);

    expect(screen.getByRole('combobox', { name: /hacia/i })).toHaveValue('9');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await vi.waitFor(() => expect(transfersApi.create).toHaveBeenCalledTimes(1));
    expect(transfersApi.create).toHaveBeenCalledWith({
      from_account_id: 3,
      to_account_id: 9,
      amount_cents: 10000,
      date: '2026-10-01',
      note: 'Ahorro mensual',
      draft_id: 88,
    });
    expect(transactionsApi.create).not.toHaveBeenCalled();
  });

  it('confirms a transfer draft into a credit card as a card settlement', async () => {
    const draft = aDraft({
      proposal: {
        type: 'transfer',
        amount_cents: 30000,
        date: '2026-10-01',
        account_id: 3,
        to_account_id: 7,
        category_id: null,
        description: 'Pago Visa',
        merchant: null,
      },
      low_confidence_fields: [],
    });
    const { transfersApi, user } = await setup(draft);

    expect(screen.getByRole('combobox', { name: /hacia/i })).toHaveValue('7');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await vi.waitFor(() => expect(transfersApi.create).toHaveBeenCalledTimes(1));
    expect(transfersApi.create).toHaveBeenCalledWith({
      kind: 'card_settlement',
      from_account_id: 3,
      to_account_id: 7,
      amount_cents: 30000,
      date: '2026-10-01',
      note: 'Pago Visa',
      draft_id: 88,
    });
  });

  it('requires the missing fields before confirming', async () => {
    const draft = aDraft({
      proposal: { ...aDraft().proposal, amount_cents: null, category_id: null },
      low_confidence_fields: ['amount_cents', 'category_id'],
    });
    const { transactionsApi, user } = await setup(draft);

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(transactionsApi.create).not.toHaveBeenCalled();
    expect(screen.getByText('Indica un importe mayor que cero.')).toBeInTheDocument();
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument();
  });

  it('scrolls to and focuses the first invalid field when Confirmar fails validation', async () => {
    const draft = aDraft({
      proposal: { ...aDraft().proposal, amount_cents: null, category_id: null },
    });
    const { user } = await setup(draft);

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await vi.waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toHaveAccessibleName(/importe/i);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    );
  });

  it('focuses the failure message when saving fails', async () => {
    const { transactionsApi, user } = await setup(aDraft());
    transactionsApi.create.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Caído' } })),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    const failure = await screen.findByTestId('review-failure');
    await vi.waitFor(() => expect(failure).toHaveFocus());
  });

  it('reserves room for the fixed action bar from the bar size tokens', async () => {
    await setup(aDraft());

    const spacer = screen.getByTestId('review-actions').previousElementSibling;
    expect(spacer).toHaveClass('h-[calc(var(--bottom-bar-block-size)+0.5rem)]', 'md:hidden');
  });

  it('offers a retry when accounts and categories fail to load', async () => {
    const accountId = aDraft().proposal.account_id ?? 3;
    const accountsList = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
      .mockReturnValue(of([anAccount({ id: accountId, name: 'BBVA' })]));
    await render(DraftReviewPage, {
      providers: [
        provideRouter([]),
        { provide: DraftsApi, useValue: { get: vi.fn(() => of(aDraft())), list: vi.fn() } },
        { provide: TransactionsApi, useValue: { create: vi.fn() } },
        { provide: TransfersApi, useValue: { create: vi.fn() } },
        { provide: AccountsApi, useValue: { list: accountsList } },
        { provide: CategoriesApi, useValue: { list: vi.fn(() => of(TREE)) } },
        { provide: TagsApi, useValue: { list: vi.fn(() => of([])) } },
        { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
      inputs: { id: '88' },
    });

    expect(await screen.findByTestId('reference-load-failed')).toHaveTextContent(
      REFERENCE_LOAD_FAILED_MESSAGE,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    await vi.waitFor(() =>
      expect(screen.queryByTestId('reference-load-failed')).not.toBeInTheDocument(),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: /^cuenta/i })).toHaveValue(String(accountId)),
    );
  });

  it('shows the failure message and uses the transcript as description', async () => {
    const draft = aDraft({
      proposal: {
        type: 'expense',
        amount_cents: null,
        date: '2026-10-13',
        account_id: 3,
        to_account_id: null,
        category_id: null,
        description: null,
        merchant: null,
      },
      field_sources: { type: 'default', date: 'default', account_id: 'default' },
      low_confidence_fields: ['amount_cents', 'category_id'],
      capture: aCapture({ status: 'failed', error: 'Provider timeout', extraction_ms: null }),
    });
    await setup(draft);

    expect(screen.getByTestId('capture-failed')).toHaveTextContent(REVIEW_MESSAGES.failed);
    const announcer = screen.getByTestId('capture-failed-announcer');
    expect(announcer).toHaveAttribute('role', 'alert');
    await vi.waitFor(() => expect(announcer).toHaveTextContent(REVIEW_MESSAGES.failed));
    expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveValue(
      'Veinte euros en Mercadona con la Visa',
    );
    expect(screen.getByRole('combobox', { name: /^cuenta/i })).toHaveValue('3');
  });

  it('shows the ticket photo for photo drafts', async () => {
    await setup(
      aDraft({
        origin: 'photo',
        capture: aCapture({ kind: 'photo', transcript: null, attachments: [anAttachment()] }),
      }),
    );

    expect(screen.getByRole('img', { name: 'Foto del ticket' })).toHaveAttribute(
      'src',
      '/api/v1/attachments/01JATTACHMENT0000000000001',
    );
    expect(screen.queryByTestId('draft-transcript')).not.toBeInTheDocument();
  });

  it('discards the draft and returns to the inbox', async () => {
    const { draftsApi, transactionsApi, navigate, toast, user } = await setup(aDraft());

    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(draftsApi.discard).toHaveBeenCalledWith(88);
    expect(transactionsApi.create).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('Borrador descartado');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/pendientes']));
  });

  it('explains when the draft was already confirmed elsewhere', async () => {
    const { transactionsApi, navigate, user } = await setup(aDraft());
    transactionsApi.create.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'x', code: 'draft_not_pending' },
          }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(REVIEW_MESSAGES.notPending)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps Confirmar and Descartar in the sticky glass action bar', async () => {
    await setup(aDraft());

    const bar = screen.getByTestId('review-actions');
    expect(bar.tagName.toLowerCase()).toBe('ui-glass-bar');
    expect(bar).toHaveAttribute('data-position', 'bottom');
    expect(bar).toHaveClass('fixed', 'md:sticky', 'rounded-capsule!');
    expect(within(bar).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Descartar' })).toBeInTheDocument();
  });

  it('collapses the original capture behind a toggle above the form on mobile', async () => {
    const { user } = await setup(aDraft());

    const toggle = screen.getByRole('button', { name: 'Ver captura original' });
    const content = document.getElementById('capture-source-content') as HTMLElement;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(content).toHaveClass('hidden', 'md:flex');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Ocultar captura original' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(content).not.toHaveClass('hidden');
  });

  it('summarises how many highlighted fields still need a look', async () => {
    const { user } = await setup(aDraft({ low_confidence_fields: ['category_id', 'merchant'] }));

    expect(screen.getByTestId('review-hint')).toHaveTextContent('2 datos marcados para revisar');

    await user.clear(screen.getByRole('textbox', { name: 'Comercio' }));
    await user.type(screen.getByRole('textbox', { name: 'Comercio' }), 'Lidl');

    expect(screen.getByTestId('review-hint')).toHaveTextContent('1 dato marcado para revisar');
  });

  it('offers a retry when the draft fails to load', async () => {
    const draftsApi = {
      get: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
        .mockReturnValue(of(aDraft())),
      list: vi.fn(() => of(aDraftPage([]))),
    };
    await render(DraftReviewPage, {
      providers: [
        provideRouter([]),
        { provide: DraftsApi, useValue: draftsApi },
        { provide: TransactionsApi, useValue: { create: vi.fn() } },
        { provide: TransfersApi, useValue: { create: vi.fn() } },
        { provide: AccountsApi, useValue: { list: vi.fn(() => of([anAccount({ id: 7 })])) } },
        { provide: CategoriesApi, useValue: { list: vi.fn(() => of(TREE)) } },
        { provide: TagsApi, useValue: { list: vi.fn(() => of([])) } },
        { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
      inputs: { id: '88' },
    });

    expect(await screen.findByText(REVIEW_MESSAGES.loadFailed)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(
      await screen.findByRole('form', { name: 'Borrador del movimiento' }),
    ).toBeInTheDocument();
    expect(draftsApi.get).toHaveBeenCalledTimes(2);
  });

  it('uses the draft cached by the capture flow without refetching', async () => {
    const draft = aDraft({ id: 91 });
    const { draftsApi } = await setupWithRemembered(draft);

    expect(draftsApi.get).not.toHaveBeenCalled();
  });
});

async function setupWithRemembered(draft: Draft) {
  const draftsApi = { get: vi.fn(() => of(draft)), list: vi.fn(() => of(aDraftPage([]))) };
  const pending = {
    recall: (id: number) => (id === draft.id ? draft : null),
    remember: vi.fn(),
    forget: vi.fn(),
    refresh: vi.fn(async () => undefined),
    count: () => 0,
  };
  await render(DraftReviewPage, {
    providers: [
      provideRouter([]),
      { provide: DraftsApi, useValue: draftsApi },
      { provide: PendingDrafts, useValue: pending },
      { provide: TransactionsApi, useValue: { create: vi.fn() } },
      { provide: TransfersApi, useValue: { create: vi.fn() } },
      { provide: AccountsApi, useValue: { list: vi.fn(() => of([anAccount({ id: 7 })])) } },
      { provide: CategoriesApi, useValue: { list: vi.fn(() => of(TREE)) } },
      { provide: TagsApi, useValue: { list: vi.fn(() => of([])) } },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    inputs: { id: String(draft.id) },
  });
  await screen.findByRole('form', { name: 'Borrador del movimiento' });
  return { draftsApi };
}

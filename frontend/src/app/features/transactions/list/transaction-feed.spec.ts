import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import {
  TransactionListQuery,
  TransactionPage,
  TransactionPageMeta,
} from '../../../core/api/models';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { TransfersApi } from '../../../core/api/transfers.api';
import { UiToast } from '../../../shared/ui';
import { MovementSheets } from '../movement-sheets';
import { aPage } from '../testing/feed-fakes';
import { aTransaction } from '../testing/transaction-fixtures';
import {
  FEED_HEADER_HEIGHT,
  FEED_ITEM_HEIGHT,
  LOAD_MORE_FAILED_MESSAGE,
  TransactionFeed,
} from './transaction-feed';

const FIRST_QUERY: TransactionListQuery = { q: 'cafe' };
const SECOND_QUERY: TransactionListQuery = { q: 'nomina' };

async function setup() {
  const stalePage = new Subject<TransactionPage>();
  const list = vi.fn(
    (query: TransactionListQuery & { page: number }): Observable<TransactionPage> => {
      if (query.page === 2) {
        return stalePage;
      }
      return query.q === FIRST_QUERY.q
        ? of(
            aPage([aTransaction({ id: 1, description: 'Café' })], {
              last_page: 2,
              total: 2,
            }),
          )
        : of(aPage([aTransaction({ id: 5, description: 'Nómina' })], { total: 1 }));
    },
  );
  const view = await render(TransactionFeed, {
    providers: [
      { provide: TransactionsApi, useValue: { list } },
      { provide: TransfersApi, useValue: {} },
      { provide: AccountsApi, useValue: { list: () => of([]) } },
      { provide: CategoriesApi, useValue: { list: () => of([]) } },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    inputs: { query: FIRST_QUERY },
  });
  const metas: TransactionPageMeta[] = [];
  view.fixture.componentInstance.metaChange.subscribe((meta) => metas.push(meta));
  return { view, list, stalePage, metas, user: userEvent.setup() };
}

function staleSecondPage(): TransactionPage {
  return aPage([aTransaction({ id: 2, description: 'Croissant' })], {
    current_page: 2,
    last_page: 2,
    total: 2,
  });
}

describe('TransactionFeed', () => {
  it('drops an in-flight load-more page when the query changes', async () => {
    const { view, list, stalePage, metas, user } = await setup();
    await screen.findByText('Café');

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ ...FIRST_QUERY, page: 2 }));

    view.fixture.componentRef.setInput('query', SECOND_QUERY);
    await screen.findByText('Nómina');
    stalePage.next(staleSecondPage());
    stalePage.complete();
    view.fixture.detectChanges();

    expect(screen.queryByText('Croissant')).not.toBeInTheDocument();
    expect(screen.queryByText('Café')).not.toBeInTheDocument();
    expect(metas.at(-1)).toEqual(expect.objectContaining({ current_page: 1, total: 1 }));
    expect(stalePage.observed).toBe(false);
  });

  it('drops an in-flight load-more page when the data changes', async () => {
    const { view, list, stalePage, metas, user } = await setup();
    await screen.findByText('Café');

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    TestBed.inject(MovementSheets).notifyChanged();
    await view.fixture.whenStable();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ ...FIRST_QUERY, page: 1 }));
    stalePage.next(staleSecondPage());
    view.fixture.detectChanges();

    expect(screen.queryByText('Croissant')).not.toBeInTheDocument();
    expect(metas.at(-1)).toEqual(expect.objectContaining({ current_page: 1, last_page: 2 }));
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeEnabled();
  });

  it('gives date headers a compact height and keeps rows within the card width', async () => {
    await setup();
    await screen.findByText('Café');

    const header = screen.getByTestId('date-header').parentElement as HTMLElement;
    const row = screen.getByTestId('transaction-row').closest('[role="listitem"]') as HTMLElement;
    expect(header.style.height).toBe(`${FEED_HEADER_HEIGHT}px`);
    expect(row.style.height).toBe(`${FEED_ITEM_HEIGHT}px`);
    expect(screen.getByRole('list', { name: 'Movimientos' })).toHaveClass(
      '[&_.cdk-virtual-scroll-content-wrapper]:w-full',
    );
  });

  it('shows a skeleton list while the first page loads', async () => {
    await render(TransactionFeed, {
      providers: [
        { provide: TransactionsApi, useValue: { list: () => new Subject<TransactionPage>() } },
        { provide: TransfersApi, useValue: {} },
        { provide: AccountsApi, useValue: { list: () => of([]) } },
        { provide: CategoriesApi, useValue: { list: () => of([]) } },
        { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
      inputs: { query: FIRST_QUERY },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Cargando movimientos');
    expect(screen.queryByRole('list', { name: 'Movimientos' })).not.toBeInTheDocument();
  });

  it('offers a retry when the movements fail to load', async () => {
    const { view, list, user } = await setup();
    await screen.findByText('Café');
    list.mockReturnValueOnce(throwError(() => new Error('offline')));
    TestBed.inject(MovementSheets).notifyChanged();
    await view.fixture.whenStable();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar los movimientos.');

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Café')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a failed load-more page and retries it', async () => {
    const { list, user } = await setup();
    await screen.findByText('Café');
    list.mockReturnValueOnce(throwError(() => new Error('offline')));

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByTestId('load-more-failed')).toHaveTextContent(
      LOAD_MORE_FAILED_MESSAGE,
    );
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    list.mockReturnValueOnce(of(staleSecondPage()));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Croissant')).toBeInTheDocument();
    expect(screen.queryByTestId('load-more-failed')).not.toBeInTheDocument();
  });
});

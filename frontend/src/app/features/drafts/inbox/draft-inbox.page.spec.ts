import { Component, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { DraftsApi } from '../../../core/api/drafts.api';
import { AuthStore } from '../../../core/auth/auth.store';
import { AppUpdates } from '../../../core/pwa/app-updates';
import { ShellLayout } from '../../shell/shell.layout';
import { aCapture, aDraft, aDraftPage } from '../testing/draft-fixtures';
import { DraftInboxPage } from './draft-inbox.page';

@Component({ selector: 'app-blank', template: '' })
class BlankPage {}

describe('Pending drafts', () => {
  it('links back to movements', async () => {
    const api = { list: vi.fn(() => of(aDraftPage([]))), get: vi.fn(), discard: vi.fn() };
    await render(DraftInboxPage, {
      providers: [provideRouter([]), { provide: DraftsApi, useValue: api }],
    });

    expect(screen.getByRole('link', { name: 'Movimientos' })).toHaveAttribute(
      'href',
      '/movimientos',
    );
  });

  it('lists pending drafts with amount, origin and review hints', async () => {
    const drafts = [
      aDraft({ id: 88, low_confidence_fields: ['category_id', 'date'] }),
      aDraft({
        id: 89,
        origin: 'photo',
        proposal: { ...aDraft().proposal, amount_cents: null, merchant: null, description: null },
        capture: aCapture({ kind: 'photo', status: 'failed', transcript: null }),
      }),
    ];
    const api = { list: vi.fn(() => of(aDraftPage(drafts))), get: vi.fn(), discard: vi.fn() };
    await render(DraftInboxPage, {
      providers: [provideRouter([]), { provide: DraftsApi, useValue: api }],
    });

    const rows = await screen.findAllByTestId('draft-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('href', '/pendientes/88');
    expect(rows[0]).toHaveTextContent('Mercadona');
    expect(rows[0]).toHaveTextContent('20,00 €');
    expect(rows[0]).toHaveTextContent('2 por revisar');
    expect(within(rows[1] as HTMLElement).getByLabelText('Foto')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Sin descripción');
    expect(rows[1]).toHaveTextContent('Sin analizar');
    expect(api.list).toHaveBeenCalledWith({ status: 'pending', page: 1, per_page: 50 });
  });

  it('offers a retry when the pending drafts fail to load', async () => {
    let failNextPage = true;
    const api = {
      list: vi.fn((query: { page?: number }) => {
        if (query.page !== undefined && failNextPage) {
          failNextPage = false;
          return throwError(() => new Error('offline'));
        }
        return of(aDraftPage([aDraft({ id: 88 })]));
      }),
      get: vi.fn(),
      discard: vi.fn(),
    };
    await render(DraftInboxPage, {
      providers: [provideRouter([]), { provide: DraftsApi, useValue: api }],
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudieron cargar los pendientes.');
    expect(screen.queryByText('No hay borradores pendientes')).not.toBeInTheDocument();

    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByTestId('draft-row')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is pending', async () => {
    await render(DraftInboxPage, {
      providers: [
        provideRouter([]),
        { provide: DraftsApi, useValue: { list: () => of(aDraftPage([])) } },
      ],
    });

    expect(await screen.findByText('No hay borradores pendientes')).toBeInTheDocument();
  });

  it('shows the pending count on the nav from meta.total and refreshes it on navigation', async () => {
    let total = 3;
    const api = { list: vi.fn(() => of(aDraftPage([], total))), get: vi.fn(), discard: vi.fn() };
    const view = await render(ShellLayout, {
      providers: [
        provideRouter([{ path: 'otra', component: BlankPage }]),
        { provide: DraftsApi, useValue: api },
        { provide: AuthStore, useValue: { user: signal(null), logout: vi.fn() } },
        {
          provide: AppUpdates,
          useValue: { updateReady: signal(false), reloadRequired: signal(false), reload: vi.fn() },
        },
      ],
    });

    const badges = await screen.findAllByTestId('drafts-badge');
    expect(badges[0]).toHaveTextContent('3');
    expect(badges[0]).toHaveTextContent('3 pendientes');
    expect(api.list).toHaveBeenCalledWith({ status: 'pending', per_page: 1 });

    total = 0;
    await view.fixture.ngZone?.run(() =>
      view.fixture.debugElement.injector.get(Router).navigateByUrl('/otra'),
    );

    await vi.waitFor(() => expect(screen.queryAllByTestId('drafts-badge')).toHaveLength(0));
  });
});

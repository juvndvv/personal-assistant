import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, Subscription, catchError, combineLatest, map, of, switchMap, tap } from 'rxjs';
import {
  Transaction,
  TransactionListQuery,
  TransactionPage,
  TransactionPageMeta,
} from '../../../core/api/models';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { formatDate } from '../../../core/date/iso-date';
import { EurPipe } from '../../../core/money/eur.pipe';
import { UiButton, UiEmptyState } from '../../../shared/ui';
import { MovementActions } from '../movement-actions';
import { MovementSheets } from '../movement-sheets';
import { LedgerReferenceData } from '../reference-data';
import { groupByDate } from '../transaction-display';
import { TransactionRow } from './transaction-row';

export const FEED_ITEM_HEIGHT = 64;
export const FEED_PAGE_SIZE = 50;

type FeedItem =
  | { kind: 'header'; key: string; date: string; netCents: number }
  | { kind: 'row'; key: string; transaction: Transaction };

type PageResult = { ok: true; page: TransactionPage } | { ok: false };

@Component({
  selector: 'app-transaction-feed',
  imports: [EurPipe, ScrollingModule, TransactionRow, UiButton, UiEmptyState],
  template: `
    @if (failed()) {
      <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        No se pudieron cargar los movimientos.
      </p>
    } @else if (loaded() && items().length === 0) {
      <ui-empty-state [title]="emptyTitle()" [description]="emptyDescription()" />
    } @else {
      <cdk-virtual-scroll-viewport
        scrollWindow
        [itemSize]="itemHeight"
        [minBufferPx]="itemHeight * 10"
        [maxBufferPx]="itemHeight * 20"
        class="overflow-hidden rounded-2xl border border-border bg-background"
        role="list"
        aria-label="Movimientos"
      >
        <div
          *cdkVirtualFor="let item of items(); trackBy: trackItem"
          [style.height.px]="itemHeight"
          role="listitem"
        >
          @if (item.kind === 'header') {
            <div
              class="flex h-full items-end justify-between border-b border-border bg-muted/40 px-3 pb-2 text-xs font-medium text-muted-foreground"
              data-testid="date-header"
            >
              <span>{{ dateLabel(item.date) }}</span>
              <span class="tabular-nums">{{ item.netCents | eur: { signed: true } }}</span>
            </div>
          } @else {
            <app-transaction-row
              [transaction]="item.transaction"
              [accountScoped]="accountScoped()"
              (edit)="sheets.openEdit($event)"
              (remove)="actions.delete($event)"
            />
          }
        </div>
      </cdk-virtual-scroll-viewport>
      @if (hasMore()) {
        <div class="mt-4 flex justify-center">
          <ui-button variant="outline" [loading]="loadingMore()" (clicked)="loadMore()">
            Cargar más
          </ui-button>
        </div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionFeed {
  private readonly api = inject(TransactionsApi);
  protected readonly sheets = inject(MovementSheets);
  protected readonly actions = inject(MovementActions);

  readonly query = input.required<TransactionListQuery | null>();
  readonly accountScoped = input(false);
  readonly pageSize = input(FEED_PAGE_SIZE);
  readonly emptyTitle = input('No hay movimientos');
  readonly emptyDescription = input<string>('Prueba con otros filtros o añade un movimiento.');
  readonly metaChange = output<TransactionPageMeta>();

  protected readonly itemHeight = FEED_ITEM_HEIGHT;
  private readonly transactions = signal<Transaction[]>([]);
  private readonly meta = signal<TransactionPageMeta | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly loadingMore = signal(false);
  private pendingMore: Subscription | null = null;

  protected readonly hasMore = computed(() => {
    const meta = this.meta();
    return meta !== null && meta.current_page < meta.last_page;
  });

  protected readonly items = computed<FeedItem[]>(() =>
    groupByDate(this.transactions()).flatMap((group) => [
      {
        kind: 'header' as const,
        key: `date-${group.date}`,
        date: group.date,
        netCents: group.netCents,
      },
      ...group.items.map((transaction) => ({
        kind: 'row' as const,
        key: `row-${transaction.id}`,
        transaction,
      })),
    ]),
  );

  constructor() {
    void inject(LedgerReferenceData)
      .ensureLoaded()
      .catch(() => undefined);
    inject(DestroyRef).onDestroy(() => this.cancelLoadMore());
    combineLatest([toObservable(this.query), toObservable(this.sheets.changes)])
      .pipe(
        tap(() => this.cancelLoadMore()),
        switchMap(([query]) => (query === null ? of(null) : this.fetch(query, 1))),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result === null) {
          return;
        }
        this.loaded.set(true);
        this.failed.set(!result.ok);
        if (result.ok) {
          this.transactions.set(result.page.data);
          this.publish(result.page.meta);
        }
      });
  }

  protected trackItem(_index: number, item: FeedItem): string {
    return item.key;
  }

  protected dateLabel(date: string): string {
    return formatDate(date, 'long');
  }

  protected loadMore(): void {
    const query = this.query();
    const meta = this.meta();
    if (query === null || meta === null || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.pendingMore = this.fetch(query, meta.current_page + 1).subscribe((result) => {
      this.pendingMore = null;
      this.loadingMore.set(false);
      if (result.ok) {
        const known = new Set(this.transactions().map((transaction) => transaction.id));
        this.transactions.update((current) => [
          ...current,
          ...result.page.data.filter((transaction) => !known.has(transaction.id)),
        ]);
        this.publish(result.page.meta);
      }
    });
  }

  private cancelLoadMore(): void {
    this.pendingMore?.unsubscribe();
    this.pendingMore = null;
    this.loadingMore.set(false);
  }

  private publish(meta: TransactionPageMeta): void {
    this.meta.set(meta);
    this.metaChange.emit(meta);
  }

  private fetch(query: TransactionListQuery, page: number): Observable<PageResult> {
    return this.api.list({ ...query, page, per_page: this.pageSize() }).pipe(
      map((result): PageResult => ({ ok: true, page: result })),
      catchError(() => of<PageResult>({ ok: false })),
    );
  }
}

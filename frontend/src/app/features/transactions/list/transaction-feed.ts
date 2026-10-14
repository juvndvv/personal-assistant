import { ScrollingModule, VIRTUAL_SCROLL_STRATEGY } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
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
import { UiAlert, UiButton, UiCard, UiEmptyState, UiSkeletonList } from '../../../shared/ui';
import { MovementActions } from '../movement-actions';
import { MovementSheets } from '../movement-sheets';
import { LedgerReferenceData } from '../reference-data';
import { groupByDate } from '../transaction-display';
import { VariableSizeScrollStrategy } from './feed-scroll-strategy';
import { TransactionRow } from './transaction-row';

export const FEED_ITEM_HEIGHT = 64;
export const FEED_HEADER_HEIGHT = 40;
const FEED_BUFFER_PX = FEED_ITEM_HEIGHT * 15;
export const FEED_PAGE_SIZE = 50;
export const LOAD_MORE_FAILED_MESSAGE = 'No se pudieron cargar más movimientos.';

type FeedItem =
  | { kind: 'header'; key: string; date: string; netCents: number }
  | { kind: 'row'; key: string; transaction: Transaction };

type PageResult = { ok: true; page: TransactionPage } | { ok: false };

@Component({
  selector: 'app-transaction-feed',
  imports: [
    EurPipe,
    ScrollingModule,
    TransactionRow,
    UiAlert,
    UiButton,
    UiCard,
    UiEmptyState,
    UiSkeletonList,
  ],
  providers: [
    {
      provide: VariableSizeScrollStrategy,
      useFactory: () => new VariableSizeScrollStrategy(FEED_BUFFER_PX),
    },
    { provide: VIRTUAL_SCROLL_STRATEGY, useExisting: VariableSizeScrollStrategy },
  ],
  template: `
    @if (failed()) {
      <ui-alert retryable [retrying]="retrying()" (retry)="retry()">
        No se pudieron cargar los movimientos.
      </ui-alert>
    } @else if (!loaded()) {
      <ui-card padding="none">
        <ui-skeleton-list label="Cargando movimientos" [rows]="6" />
      </ui-card>
    } @else if (items().length === 0) {
      <ui-empty-state [title]="emptyTitle()" [description]="emptyDescription()" />
    } @else {
      <ui-card padding="none" class="overflow-hidden">
        <cdk-virtual-scroll-viewport
          scrollWindow
          class="[&_.cdk-virtual-scroll-content-wrapper]:w-full [&_.cdk-virtual-scroll-content-wrapper]:max-w-full"
          role="list"
          aria-label="Movimientos"
        >
          <div
            *cdkVirtualFor="let item of items(); trackBy: trackItem"
            class="min-w-0"
            [style.height.px]="item.kind === 'header' ? headerHeight : itemHeight"
            role="listitem"
          >
            @if (item.kind === 'header') {
              <div
                class="flex h-full items-center justify-between gap-3 border-b border-hairline bg-grouped px-4 text-sm font-medium text-muted-foreground"
                data-testid="date-header"
              >
                <span class="min-w-0 truncate">{{ dateLabel(item.date) }}</span>
                <span class="tabular-amount shrink-0">{{
                  item.netCents | eur: { signed: true }
                }}</span>
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
      </ui-card>
      @if (hasMore()) {
        @if (loadMoreFailed()) {
          <ui-alert
            class="mt-4"
            retryable
            data-testid="load-more-failed"
            [retrying]="loadingMore()"
            (retry)="loadMore()"
            >{{ loadMoreFailedMessage }}</ui-alert
          >
        } @else {
          <div class="mt-4 flex justify-center">
            <ui-button variant="outline" [loading]="loadingMore()" (clicked)="loadMore()">
              Cargar más
            </ui-button>
          </div>
        }
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
  readonly failedChange = output<boolean>();

  protected readonly itemHeight = FEED_ITEM_HEIGHT;
  protected readonly headerHeight = FEED_HEADER_HEIGHT;
  private readonly transactions = signal<Transaction[]>([]);
  private readonly meta = signal<TransactionPageMeta | null>(null);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly loadMoreFailed = signal(false);
  protected readonly loadMoreFailedMessage = LOAD_MORE_FAILED_MESSAGE;
  protected readonly retrying = signal(false);
  private readonly reloads = signal(0);
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
    const scrollStrategy = inject(VariableSizeScrollStrategy);
    effect(() =>
      scrollStrategy.setItemSizes(
        this.items().map((item) =>
          item.kind === 'header' ? FEED_HEADER_HEIGHT : FEED_ITEM_HEIGHT,
        ),
      ),
    );
    void inject(LedgerReferenceData)
      .ensureLoaded()
      .catch(() => undefined);
    inject(DestroyRef).onDestroy(() => this.cancelLoadMore());
    combineLatest([
      toObservable(this.query),
      toObservable(this.sheets.changes),
      toObservable(this.reloads),
    ])
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
        this.retrying.set(false);
        this.failed.set(!result.ok);
        this.failedChange.emit(!result.ok);
        if (result.ok) {
          this.transactions.set(result.page.data);
          this.publish(result.page.meta);
        }
      });
  }

  protected retry(): void {
    this.retrying.set(true);
    this.reloads.update((count) => count + 1);
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
      this.loadMoreFailed.set(!result.ok);
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
    this.loadMoreFailed.set(false);
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

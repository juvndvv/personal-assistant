import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, filter, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { serverMessage } from '../../core/api/api-error';
import { BudgetsApi } from '../../core/api/budgets.api';
import { BudgetHistoryEntry, CategorySummary } from '../../core/api/models';
import { formatPeriodLabel } from '../../core/date/period-label';
import { UiButton, UiSheet, UiToast } from '../../shared/ui';
import { budgetAmountLabel } from './budget-display';

type HistoryState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; entries: BudgetHistoryEntry[] };

@Component({
  selector: 'app-budget-history-sheet',
  imports: [UiButton, UiSheet],
  template: `
    <ui-sheet
      [(open)]="open"
      [title]="title()"
      description="Cada cambio se aplica desde su periodo y se repite hasta el siguiente cambio."
    >
      @switch (state().status) {
        @case ('loading') {
          <p class="text-sm text-muted-foreground">Cargando historial…</p>
        }
        @case ('failed') {
          <p role="alert" class="text-sm text-destructive">No se pudo cargar el historial.</p>
        }
        @default {
          @if (entries().length === 0) {
            <p class="text-sm text-muted-foreground">
              Aún no has definido un presupuesto para esta categoría.
            </p>
          } @else {
            <ol class="divide-y divide-border pb-2" aria-label="Cambios de presupuesto">
              @for (entry of entries(); track entry.effective_from) {
                <li
                  class="flex items-baseline justify-between gap-3 py-2 text-sm"
                  data-testid="budget-history-entry"
                >
                  <span class="text-foreground">Desde {{ periodName(entry.effective_from) }}</span>
                  <span class="tabular-nums text-foreground">{{
                    amountLabel(entry.amount_cents)
                  }}</span>
                </li>
              }
            </ol>
            @if (confirmingClear()) {
              <div
                role="group"
                aria-label="Confirmar eliminación del presupuesto"
                class="mt-2 flex flex-col gap-3 rounded-xl bg-destructive/10 p-3"
              >
                <p class="text-sm text-foreground">
                  Se borrará el presupuesto de {{ category()?.name }} en todos los periodos, junto
                  con su historial. Después podrás convertirla en subcategoría.
                </p>
                <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <ui-button variant="outline" (clicked)="confirmingClear.set(false)"
                    >Cancelar</ui-button
                  >
                  <ui-button variant="danger" [loading]="clearing()" (clicked)="clear()"
                    >Eliminar</ui-button
                  >
                </div>
              </div>
            } @else {
              <ui-button variant="outline" (clicked)="confirmingClear.set(true)"
                >Eliminar presupuesto e historial</ui-button
              >
            }
          }
        }
      }
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetHistorySheet {
  private readonly api = inject(BudgetsApi);
  private readonly toast = inject(UiToast);

  readonly category = input<CategorySummary | null>(null);
  readonly open = model(false);
  readonly cleared = output<CategorySummary>();

  protected readonly state = signal<HistoryState>({ status: 'loading' });
  protected readonly entries = computed(() => {
    const state = this.state();
    return state.status === 'loaded' ? state.entries : [];
  });
  protected readonly title = computed(() => `Historial de ${this.category()?.name ?? ''}`);
  protected readonly confirmingClear = signal(false);
  protected readonly clearing = signal(false);
  private readonly request = computed(() => (this.open() ? this.category() : null));

  constructor() {
    toObservable(this.request)
      .pipe(
        filter((category): category is CategorySummary => category !== null),
        tap(() => {
          this.state.set({ status: 'loading' });
          this.confirmingClear.set(false);
        }),
        switchMap((category) =>
          this.api.history(category.id).pipe(
            map((entries): HistoryState => ({ status: 'loaded', entries })),
            catchError(() => of<HistoryState>({ status: 'failed' })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected async clear(): Promise<void> {
    const category = this.category();
    if (category === null || this.clearing()) {
      return;
    }
    this.clearing.set(true);
    try {
      await firstValueFrom(this.api.clear(category.id), { defaultValue: undefined });
      this.state.set({ status: 'loaded', entries: [] });
      this.confirmingClear.set(false);
      this.open.set(false);
      this.toast.success(`Presupuesto de ${category.name} eliminado`);
      this.cleared.emit(category);
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo eliminar el presupuesto.');
    } finally {
      this.clearing.set(false);
    }
  }

  protected periodName(label: string): string {
    return formatPeriodLabel(label);
  }

  protected amountLabel(cents: number): string {
    return budgetAmountLabel(cents);
  }
}

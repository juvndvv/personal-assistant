import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { validationErrors } from '../../core/api/api-error';
import { BudgetsApi } from '../../core/api/budgets.api';
import { Budget, PeriodLabel } from '../../core/api/models';
import { formatPeriodLabel } from '../../core/date/period-label';
import { UiButton, UiMoneyInput, UiToast } from '../../shared/ui';
import { hasBudget } from './budget-display';

const MISSING_AMOUNT = 'Introduce un importe. Pon 0 para quitar el presupuesto.';
const SAVE_FAILED = 'No se pudo guardar el presupuesto. Inténtalo de nuevo.';

@Component({
  selector: 'app-budget-editor',
  imports: [UiButton, UiMoneyInput],
  template: `
    <form class="flex flex-col gap-3" novalidate (submit)="save($event)">
      <ui-money-input
        [label]="'Presupuesto mensual de ' + budget().category.name"
        [name]="'budget-' + budget().category.id"
        [(value)]="amount"
        [state]="error() === null ? 'default' : 'error'"
        [hint]="error() ?? hint()"
      />
      <div class="flex justify-end gap-2">
        <ui-button variant="ghost" size="sm" (clicked)="cancelled.emit()">Cancelar</ui-button>
        <ui-button type="submit" size="sm" [loading]="saving()" loadingLabel="Guardando">
          Guardar
        </ui-button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetEditor {
  private readonly api = inject(BudgetsApi);
  private readonly toast = inject(UiToast);

  readonly budget = input.required<Budget>();
  readonly period = input.required<PeriodLabel>();
  readonly saved = output<Budget>();
  readonly cancelled = output<void>();

  protected readonly amount = linkedSignal<number | null>(() => {
    const cents = this.budget().amount_cents;
    return hasBudget(cents) ? cents : null;
  });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly periodName = computed(() => formatPeriodLabel(this.period()));
  protected readonly hint = computed(
    () => `Se aplica desde este periodo (${this.periodName()}). Pon 0 para dejar de presupuestar.`,
  );

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving()) {
      return;
    }
    const amountCents = this.amount();
    if (amountCents === null) {
      this.error.set(MISSING_AMOUNT);
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    const name = this.budget().category.name;
    try {
      const budget = await firstValueFrom(
        this.api.set(this.budget().category.id, {
          amount_cents: amountCents,
          effective_from: this.period(),
        }),
      );
      this.toast.success(
        amountCents === 0
          ? `${name} ya no tiene presupuesto desde ${this.periodName()}`
          : `Presupuesto de ${name} guardado`,
      );
      this.saved.emit(budget);
    } catch (error) {
      const messages = validationErrors(error);
      const first = messages === null ? undefined : Object.values(messages)[0];
      if (first === undefined) {
        this.toast.error(SAVE_FAILED);
      } else {
        this.error.set(first);
      }
    } finally {
      this.saving.set(false);
    }
  }
}

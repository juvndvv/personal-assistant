import { Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, filter, map, of, switchMap } from 'rxjs';
import { BudgetVsActual, PeriodLabel } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import { MovementSheets } from '../transactions/movement-sheets';

export interface BudgetVsActualSource {
  report: Signal<BudgetVsActual | null>;
  failed: Signal<boolean>;
  reload(): void;
}

export function budgetVsActualSource(period: Signal<PeriodLabel | null>): BudgetVsActualSource {
  const api = inject(ReportsApi);
  const sheets = inject(MovementSheets);
  const report = signal<BudgetVsActual | null>(null);
  const failed = signal(false);
  const reloads = signal(0);

  combineLatest([toObservable(period), toObservable(sheets.changes), toObservable(reloads)])
    .pipe(
      map(([label]) => label),
      filter((label): label is PeriodLabel => label !== null),
      switchMap((label) =>
        api.budgetVsActual(label).pipe(
          map((data) => ({ data, failed: false })),
          catchError(() => of({ data: null, failed: true })),
        ),
      ),
      takeUntilDestroyed(),
    )
    .subscribe((result) => {
      report.set(result.data);
      failed.set(result.failed);
    });

  return {
    report: report.asReadonly(),
    failed: failed.asReadonly(),
    reload: () => reloads.update((count) => count + 1),
  };
}

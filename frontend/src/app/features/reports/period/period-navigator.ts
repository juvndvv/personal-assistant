import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Period, PeriodLabel } from '../../../core/api/models';
import { PeriodsApi } from '../../../core/api/periods.api';
import { isPeriodLabel, shiftPeriodLabel } from '../../../core/date/period-label';

export const PERIOD_QUERY_PARAM = 'period';

@Injectable()
export class PeriodNavigator {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly periodsApi = inject(PeriodsApi);

  private readonly currentPeriod = signal<Period | null>(null);
  private readonly loadFailed = signal(false);
  private readonly requested = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const value = params.get(PERIOD_QUERY_PARAM);
        return isPeriodLabel(value) ? value : null;
      }),
    ),
    { initialValue: null },
  );

  readonly current = this.currentPeriod.asReadonly();
  readonly failed = this.loadFailed.asReadonly();
  readonly label = computed<PeriodLabel | null>(
    () => this.requested() ?? this.currentPeriod()?.label ?? null,
  );
  readonly isCurrent = computed(() => this.label() === this.currentPeriod()?.label);
  readonly canGoNext = computed(() => {
    const label = this.label();
    const current = this.currentPeriod();
    return label !== null && current !== null && label < current.label;
  });

  constructor() {
    this.periodsApi.current().subscribe({
      next: (period) => this.currentPeriod.set(period),
      error: () => this.loadFailed.set(true),
    });
  }

  previous(): void {
    this.shift(-1);
  }

  next(): void {
    if (this.canGoNext()) {
      this.shift(1);
    }
  }

  goToCurrent(): void {
    this.goTo(null);
  }

  goTo(label: PeriodLabel | null): void {
    const target = label === this.currentPeriod()?.label ? null : label;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [PERIOD_QUERY_PARAM]: target },
      queryParamsHandling: 'merge',
    });
  }

  private shift(delta: number): void {
    const label = this.label();
    if (label !== null) {
      this.goTo(shiftPeriodLabel(label, delta));
    }
  }
}

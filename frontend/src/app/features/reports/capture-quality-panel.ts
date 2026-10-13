import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of, switchMap } from 'rxjs';
import { CaptureMetrics, PeriodLabel } from '../../core/api/models';
import { ReportsApi } from '../../core/api/reports.api';
import {
  StatStatus,
  StatTile,
  formatBasisPoints,
  formatDecimal,
  formatSeconds,
} from '../../shared/charts';
import { CAPTURE_TARGETS } from './reports-display';

interface MetricTile {
  key: string;
  label: string;
  value: string;
  hint: string;
  status: StatStatus | null;
  statusLabel: string;
}

@Component({
  selector: 'app-capture-quality-panel',
  imports: [StatTile],
  template: `
    <section
      class="rounded-2xl border border-border bg-background p-5"
      aria-labelledby="capture-quality-heading"
      data-testid="capture-quality"
    >
      <h2 id="capture-quality-heading" class="text-lg font-semibold text-foreground">
        Calidad de captura
      </h2>
      @if (failed()) {
        <p role="alert" class="mt-2 text-sm text-destructive">
          No se pudieron cargar las métricas de captura.
        </p>
      } @else if (metrics(); as data) {
        <p class="mt-1 text-xs text-muted-foreground" data-testid="captures-confirmed">
          {{ confirmedLabel() }}
        </p>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          @for (tile of tiles(); track tile.key) {
            <app-stat-tile
              [attr.data-testid]="'capture-' + tile.key"
              [label]="tile.label"
              [value]="tile.value"
              [hint]="tile.hint"
              [status]="tile.status"
              [statusLabel]="tile.statusLabel"
            />
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureQualityPanel {
  private readonly api = inject(ReportsApi);

  readonly period = input.required<PeriodLabel | null>();

  protected readonly metrics = signal<CaptureMetrics | null>(null);
  protected readonly failed = signal(false);

  protected readonly confirmedLabel = computed(() => {
    const confirmed = this.metrics()?.captures_confirmed ?? 0;
    return confirmed === 0
      ? 'Sin capturas por voz o foto confirmadas en este periodo.'
      : `${confirmed} ${confirmed === 1 ? 'captura confirmada' : 'capturas confirmadas'} por voz o foto.`;
  });

  protected readonly tiles = computed<MetricTile[]>(() => {
    const data = this.metrics();
    if (data === null) {
      return [];
    }
    const median = data.median_seconds_to_confirm;
    const unedited = data.unedited_share_bp;
    const perWeek = data.active_days_per_week;
    return [
      {
        key: 'time',
        label: 'Tiempo hasta confirmar (mediana)',
        value: formatSeconds(median),
        hint: `p90: ${formatSeconds(data.p90_seconds_to_confirm)}`,
        ...withTarget(
          median === null ? null : median < CAPTURE_TARGETS.maxMedianSeconds,
          `menos de ${CAPTURE_TARGETS.maxMedianSeconds} s`,
        ),
      },
      {
        key: 'unedited',
        label: 'Confirmadas sin editar',
        value: formatBasisPoints(unedited),
        hint: 'Capturas que no necesitaron correcciones',
        ...withTarget(
          unedited === null ? null : unedited >= CAPTURE_TARGETS.minUneditedShareBp,
          `${formatBasisPoints(CAPTURE_TARGETS.minUneditedShareBp)} o más`,
        ),
      },
      {
        key: 'active-days',
        label: 'Días con registros por semana',
        value: perWeek === null ? '—' : `${formatDecimal(perWeek)} de 7`,
        hint: `${data.active_days} de ${data.elapsed_days} días del periodo`,
        ...withTarget(
          perWeek === null ? null : perWeek >= CAPTURE_TARGETS.minActiveDaysPerWeek,
          `${CAPTURE_TARGETS.minActiveDaysPerWeek} de 7 días o más`,
        ),
      },
    ];
  });

  constructor() {
    toObservable(this.period)
      .pipe(
        filter((period): period is PeriodLabel => period !== null),
        switchMap((period) =>
          this.api.captureMetrics(period).pipe(
            map((metrics) => ({ metrics, failed: false })),
            catchError(() => of({ metrics: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ metrics, failed }) => {
        this.metrics.set(metrics);
        this.failed.set(failed);
      });
  }
}

function withTarget(
  met: boolean | null,
  target: string,
): Pick<MetricTile, 'status' | 'statusLabel'> {
  if (met === null) {
    return { status: null, statusLabel: `Objetivo: ${target}` };
  }
  return met
    ? { status: 'good', statusLabel: `Objetivo cumplido: ${target}` }
    : { status: 'warning', statusLabel: `Objetivo no alcanzado: ${target}` };
}

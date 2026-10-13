import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryKind, PeriodSummary } from '../../core/api/models';
import { EurPipe } from '../../core/money/eur.pipe';
import {
  DonutChart,
  ProgressBar,
  foldSegments,
  formatBasisPoints,
  seriesColor,
} from '../../shared/charts';
import { UiSegmentOption, UiSegmented } from '../../shared/ui';
import { KIND_LABELS, movementsQueryParams } from './reports-display';

const MAX_DONUT_SEGMENTS = 6;

@Component({
  selector: 'app-category-breakdown',
  imports: [DonutChart, EurPipe, ProgressBar, RouterLink, UiSegmented],
  template: `
    <section
      class="rounded-2xl border border-border bg-background p-5"
      aria-labelledby="breakdown-heading"
      data-testid="category-breakdown"
    >
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="breakdown-heading" class="text-lg font-semibold text-foreground">Por categoría</h2>
        <div class="w-56">
          <ui-segmented
            ariaLabel="Tipo de categoría"
            [options]="kindOptions"
            [value]="kind()"
            (valueChange)="kindChange.emit($any($event))"
          />
        </div>
      </div>

      @if (parent(); as current) {
        <nav aria-label="Ruta de categorías" class="mb-3 text-sm">
          <a
            [routerLink]="[]"
            [queryParams]="{ category: null }"
            queryParamsHandling="merge"
            class="text-primary hover:underline"
            >Todas las categorías</a
          >
          <span class="text-muted-foreground" aria-hidden="true"> / </span>
          <span aria-current="page" class="text-foreground">{{ current.name }}</span>
        </nav>
        <div class="mb-3 flex items-baseline justify-between gap-3">
          <h3 class="text-base font-semibold text-foreground" data-testid="drill-heading">
            {{ current.name }}
          </h3>
          <span class="font-semibold tabular-nums text-foreground">{{
            current.amount_cents | eur
          }}</span>
        </div>
        <ul class="divide-y divide-border" [attr.aria-label]="'Subcategorías de ' + current.name">
          @for (child of current.children; track child.category_id) {
            <li>
              <a
                [routerLink]="['/movimientos']"
                [queryParams]="movementsParams(child.category_id)"
                class="flex flex-col gap-1.5 py-2.5 hover:text-primary"
                data-testid="breakdown-row"
              >
                <span class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="truncate text-foreground">{{ child.name }}</span>
                  <span class="tabular-nums text-foreground">{{ child.amount_cents | eur }}</span>
                </span>
                <app-progress-bar
                  [value]="child.amount_cents"
                  [max]="current.amount_cents"
                  [label]="'Peso de ' + child.name + ' en ' + current.name"
                />
              </a>
            </li>
          }
          @if (current.own_cents > 0) {
            <li class="flex flex-col gap-1.5 py-2.5" data-testid="breakdown-own-row">
              <span class="flex items-baseline justify-between gap-3 text-sm">
                <span class="truncate text-muted-foreground">Sin subcategoría</span>
                <span class="tabular-nums text-foreground">{{ current.own_cents | eur }}</span>
              </span>
              <app-progress-bar
                [value]="current.own_cents"
                [max]="current.amount_cents"
                [label]="'Peso sin subcategoría en ' + current.name"
              />
            </li>
          }
        </ul>
        <a
          [routerLink]="['/movimientos']"
          [queryParams]="movementsParams(current.category_id)"
          class="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Ver los movimientos de {{ current.name }}
        </a>
      } @else if (nodes().length === 0) {
        <p class="text-sm text-muted-foreground" data-testid="breakdown-empty">
          No hay {{ kindLabel().toLowerCase() }} en este periodo.
        </p>
      } @else {
        <app-donut-chart
          class="mb-4"
          [segments]="segments()"
          [ariaLabel]="kindLabel() + ' por categoría'"
          [totalLabel]="kindLabel()"
        />
        <ul class="divide-y divide-border" [attr.aria-label]="kindLabel() + ' por categoría'">
          @for (node of nodes(); track node.category_id) {
            <li>
              <a
                [routerLink]="node.children.length > 0 ? [] : ['/movimientos']"
                [queryParams]="
                  node.children.length > 0
                    ? { category: node.category_id }
                    : movementsParams(node.category_id)
                "
                [queryParamsHandling]="node.children.length > 0 ? 'merge' : ''"
                class="flex flex-col gap-1.5 py-2.5 hover:text-primary"
                data-testid="breakdown-row"
              >
                <span class="flex items-baseline justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate text-foreground">
                    {{ node.name }}
                    @if (node.children.length > 0) {
                      <span class="text-xs text-muted-foreground">
                        · {{ node.children.length }}
                        {{ node.children.length === 1 ? 'subcategoría' : 'subcategorías' }}
                      </span>
                    }
                  </span>
                  <span class="shrink-0 tabular-nums text-foreground">
                    {{ node.amount_cents | eur }}
                    <span class="ms-1 text-xs text-muted-foreground">{{
                      share(node.share_bp)
                    }}</span>
                  </span>
                </span>
                <app-progress-bar
                  [value]="node.share_bp"
                  [color]="colorOf(node.category_id)"
                  [label]="'Peso de ' + node.name"
                  [valueText]="share(node.share_bp)"
                />
              </a>
            </li>
          }
        </ul>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryBreakdown {
  readonly summary = input.required<PeriodSummary>();
  readonly kind = input<CategoryKind>('expense');
  readonly parentId = input<number | null>(null);

  readonly kindChange = output<CategoryKind>();

  protected readonly kindOptions: UiSegmentOption[] = [
    { value: 'expense', label: KIND_LABELS.expense },
    { value: 'income', label: KIND_LABELS.income },
  ];

  protected readonly kindLabel = computed(() => KIND_LABELS[this.kind()]);
  protected readonly nodes = computed(() => this.summary().by_category[this.kind()] ?? []);
  protected readonly parent = computed(
    () => this.nodes().find((node) => node.category_id === this.parentId()) ?? null,
  );
  protected readonly segments = computed(() =>
    foldSegments(
      this.nodes().map((node) => ({
        key: String(node.category_id),
        label: node.name,
        value: node.amount_cents,
      })),
      MAX_DONUT_SEGMENTS,
      'Otras',
    ),
  );

  private readonly colors = computed(() => {
    const byKey = new Map(
      this.segments().map((segment) => [segment.key, seriesColor(segment.slot)]),
    );
    const other = seriesColor(null);
    return (categoryId: number) => byKey.get(String(categoryId)) ?? other;
  });

  protected colorOf(categoryId: number): string {
    return this.colors()(categoryId);
  }

  protected share(shareBp: number): string {
    return formatBasisPoints(shareBp);
  }

  protected movementsParams(categoryId: number) {
    return movementsQueryParams(this.summary().period.label, categoryId);
  }
}

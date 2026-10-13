import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideRepeat } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { serverMessage } from '../../core/api/api-error';
import { RecurringTemplate } from '../../core/api/models';
import { RecurringApi } from '../../core/api/recurring.api';
import { formatDate } from '../../core/date/iso-date';
import { EurPipe } from '../../core/money/eur.pipe';
import { PageHeader } from '../../shared/layout/page-header';
import {
  UiBadge,
  UiButton,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiToast,
} from '../../shared/ui';
import { isPaused, scheduleSummary } from './recurring-display';

@Component({
  selector: 'app-recurring-page',
  imports: [
    EurPipe,
    PageHeader,
    RouterLink,
    UiBadge,
    UiButton,
    UiDialog,
    UiDialogFooter,
    UiEmptyState,
  ],
  providers: [provideIcons({ lucideRepeat })],
  template: `
    <a routerLink="/mas" class="mb-4 inline-block text-sm text-primary hover:underline">← Más</a>
    <app-page-header
      title="Fijos"
      subtitle="Ingresos y gastos que se repiten. Se registran solos en su fecha."
    />
    <div class="mb-6 flex justify-end">
      <a
        routerLink="/mas/fijos/nuevo"
        class="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Nuevo fijo
      </a>
    </div>

    @if (failure(); as message) {
      <p role="alert" class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {{ message }}
      </p>
    }

    @if (loaded() && templates().length === 0) {
      <ui-empty-state
        title="Aún no tienes fijos"
        description="Añade tu nómina, el alquiler o las facturas para que se registren solos cada mes."
        icon="lucideRepeat"
      >
        <a routerLink="/mas/fijos/nuevo" class="text-sm font-medium text-primary hover:underline">
          Nuevo fijo
        </a>
      </ui-empty-state>
    } @else {
      <ul
        class="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background"
        aria-label="Fijos"
      >
        @for (template of templates(); track template.id) {
          <li
            class="flex flex-wrap items-center gap-3 px-4 py-3"
            data-testid="recurring-row"
            [class.opacity-70]="paused(template)"
          >
            <a
              [routerLink]="['/mas/fijos', template.id]"
              class="min-w-0 flex-1"
              [attr.aria-label]="'Editar ' + template.name"
            >
              <span class="flex flex-wrap items-center gap-2 font-medium text-foreground">
                <span class="truncate">{{ template.name }}</span>
                @if (template.is_variable) {
                  <ui-badge tone="info">Variable</ui-badge>
                }
                @if (paused(template)) {
                  <ui-badge tone="neutral">Pausado</ui-badge>
                }
              </span>
              <span class="block text-xs text-muted-foreground">{{ schedule(template) }}</span>
              <span class="block text-xs text-muted-foreground">{{ nextDue(template) }}</span>
            </a>
            <span
              class="shrink-0 font-semibold tabular-nums"
              [class]="template.type === 'income' ? 'text-success' : 'text-foreground'"
            >
              {{ signedAmount(template) | eur: { signed: true } }}
            </span>
            <div class="flex w-full justify-end gap-1 sm:w-auto">
              @if (paused(template)) {
                <ui-button
                  variant="ghost"
                  size="sm"
                  [ariaLabel]="'Reanudar ' + template.name"
                  [disabled]="busyId() === template.id"
                  (clicked)="resume(template)"
                >
                  Reanudar
                </ui-button>
              } @else {
                <ui-button
                  variant="ghost"
                  size="sm"
                  [ariaLabel]="'Pausar ' + template.name"
                  [disabled]="busyId() === template.id"
                  (clicked)="pause(template)"
                >
                  Pausar
                </ui-button>
              }
              <ui-button
                variant="ghost"
                size="sm"
                [ariaLabel]="'Eliminar ' + template.name"
                (clicked)="deleteTarget.set(template)"
              >
                Eliminar
              </ui-button>
            </div>
          </li>
        }
      </ul>
      @if (!loaded()) {
        <p class="mt-4 text-sm text-muted-foreground" role="status">Cargando fijos…</p>
      }
    }

    <ui-dialog
      [open]="deleteTarget() !== null"
      (openChange)="$event || deleteTarget.set(null)"
      title="Eliminar fijo"
      [description]="deleteDescription()"
    >
      <div uiDialogFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ui-button variant="outline" (clicked)="deleteTarget.set(null)">Cancelar</ui-button>
        <ui-button variant="danger" [loading]="deleting()" (clicked)="remove()">Eliminar</ui-button>
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringPage {
  private readonly api = inject(RecurringApi);
  private readonly toast = inject(UiToast);

  protected readonly templates = signal<RecurringTemplate[]>([]);
  protected readonly loaded = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly busyId = signal<number | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteTarget = signal<RecurringTemplate | null>(null);
  protected readonly paused = isPaused;
  protected readonly schedule = scheduleSummary;

  constructor() {
    void this.load();
  }

  protected deleteDescription(): string {
    const name = this.deleteTarget()?.name ?? '';
    return `¿Eliminar «${name}»? Los movimientos ya registrados se mantienen y los borradores pendientes de este fijo se descartarán.`;
  }

  protected nextDue(template: RecurringTemplate): string {
    return template.next_due_date === null
      ? 'Sin próximas fechas'
      : `Próximo: ${formatDate(template.next_due_date, 'medium')}`;
  }

  protected signedAmount(template: RecurringTemplate): number {
    return template.type === 'income' ? template.amount_cents : -template.amount_cents;
  }

  protected pause(template: RecurringTemplate): Promise<void> {
    return this.mutate(template, () => this.api.pause(template.id), 'Fijo pausado');
  }

  protected resume(template: RecurringTemplate): Promise<void> {
    return this.mutate(template, () => this.api.resume(template.id), 'Fijo reanudado');
  }

  protected async remove(): Promise<void> {
    const target = this.deleteTarget();
    if (target === null || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.failure.set(null);
    try {
      await firstValueFrom(this.api.delete(target.id));
      this.templates.update((templates) => templates.filter((item) => item.id !== target.id));
      this.deleteTarget.set(null);
      this.toast.success('Fijo eliminado');
    } catch (error: unknown) {
      this.deleteTarget.set(null);
      this.failure.set(serverMessage(error) ?? 'No se pudo eliminar el fijo.');
    } finally {
      this.deleting.set(false);
    }
  }

  private async mutate(
    template: RecurringTemplate,
    request: () => ReturnType<RecurringApi['pause']>,
    message: string,
  ): Promise<void> {
    if (this.busyId() !== null) {
      return;
    }
    this.busyId.set(template.id);
    this.failure.set(null);
    try {
      const updated = await firstValueFrom(request());
      this.templates.update((templates) =>
        templates.map((item) => (item.id === updated.id ? updated : item)),
      );
      this.toast.success(message);
    } catch (error: unknown) {
      this.failure.set(serverMessage(error) ?? 'No se pudo actualizar el fijo.');
    } finally {
      this.busyId.set(null);
    }
  }

  private async load(): Promise<void> {
    try {
      this.templates.set(await firstValueFrom(this.api.list(true)));
    } catch (error: unknown) {
      this.failure.set(serverMessage(error) ?? 'No se pudieron cargar los fijos.');
    } finally {
      this.loaded.set(true);
    }
  }
}

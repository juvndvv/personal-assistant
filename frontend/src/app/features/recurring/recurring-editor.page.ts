import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { serverMessage, validationErrors } from '../../core/api/api-error';
import {
  RecurringTemplate,
  RecurringTemplateInput,
  RecurringTemplatePatch,
} from '../../core/api/models';
import { RecurringApi } from '../../core/api/recurring.api';
import { PageHeader } from '../../shared/layout/page-header';
import { UiToast } from '../../shared/ui';
import { LedgerReferenceData } from '../transactions/reference-data';
import { RecurringTemplateForm, RecurringTemplateFormErrors } from './recurring-template-form';

const LIST_URL = '/mas/fijos';
const FORM_FIELDS = new Set<string>([
  'name',
  'type',
  'amount_cents',
  'is_variable',
  'account_id',
  'category_id',
  'frequency',
  'day_of_month',
  'starts_on',
  'ends_on',
  'description',
  'merchant',
]);

@Component({
  selector: 'app-recurring-editor-page',
  imports: [PageHeader, RecurringTemplateForm],
  template: `
    <app-page-header [title]="title()" />
    @if (failure(); as message) {
      <p role="alert" class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {{ message }}
      </p>
    }
    @if (ready()) {
      <section class="rounded-2xl border border-border bg-background p-4 md:p-6">
        <app-recurring-template-form
          [template]="template()"
          [accounts]="reference.writableAccounts()"
          [categories]="reference.categories()"
          [serverErrors]="serverErrors()"
          [saving]="saving()"
          (submitted)="save($event)"
          (cancelled)="leave()"
        />
      </section>
    } @else if (failure() === null) {
      <p class="text-sm text-muted-foreground" role="status">Cargando…</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringEditorPage implements OnInit {
  private readonly api = inject(RecurringApi);
  private readonly router = inject(Router);
  private readonly toast = inject(UiToast);
  protected readonly reference = inject(LedgerReferenceData);

  readonly id = input<string>();

  protected readonly template = signal<RecurringTemplate | null>(null);
  protected readonly serverErrors = signal<RecurringTemplateFormErrors>({});
  protected readonly saving = signal(false);
  protected readonly ready = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly title = computed(() =>
    this.id() === undefined ? 'Nuevo fijo' : 'Editar fijo',
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async save(payload: RecurringTemplateInput): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    const current = this.template();
    try {
      await firstValueFrom(
        current === null
          ? this.api.create(payload)
          : this.api.update(current.id, patchFor(current, payload)),
      );
      this.toast.success(current === null ? 'Fijo creado' : 'Fijo actualizado');
      await this.router.navigateByUrl(LIST_URL);
    } catch (error: unknown) {
      this.handleSaveError(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected leave(): void {
    void this.router.navigateByUrl(LIST_URL);
  }

  private async load(): Promise<void> {
    try {
      const id = this.id();
      const [template] = await Promise.all([
        id === undefined ? Promise.resolve(null) : firstValueFrom(this.api.get(Number(id))),
        this.reference.ensureLoaded(),
      ]);
      this.template.set(template);
      this.ready.set(true);
    } catch (error: unknown) {
      this.failure.set(serverMessage(error) ?? 'No se pudo cargar el fijo.');
    }
  }

  private handleSaveError(error: unknown): void {
    const fields = validationErrors(error);
    if (fields !== null && Object.keys(fields).some((field) => FORM_FIELDS.has(field))) {
      this.serverErrors.set(fields);
      return;
    }
    this.failure.set(serverMessage(error) ?? 'No se pudo guardar el fijo. Inténtalo de nuevo.');
  }
}

function patchFor(
  current: RecurringTemplate,
  payload: RecurringTemplateInput,
): RecurringTemplatePatch {
  if (payload.type !== current.type) {
    return payload;
  }
  const patch: RecurringTemplatePatch = { ...payload };
  delete patch.type;
  return patch;
}

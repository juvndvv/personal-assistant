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
import { AccountsApi } from '../../core/api/accounts.api';
import { conflictCode, serverMessage, validationErrors } from '../../core/api/api-error';
import { Account, AccountInput } from '../../core/api/models';
import { PageHeader } from '../../shared/layout/page-header';
import { UiAlert, UiCard, UiSkeleton, UiToast } from '../../shared/ui';
import { AccountForm, AccountFormErrors } from './account-form';

const EDITABLE_FIELDS = new Set<string>([
  'name',
  'type',
  'opening_balance_cents',
  'opening_date',
  'statement_day',
  'settlement_account_id',
]);
const OPENING_DATE_CONFLICT = 'Hay movimientos anteriores a esa fecha. Elige una fecha anterior.';

@Component({
  selector: 'app-account-editor-page',
  imports: [AccountForm, PageHeader, UiAlert, UiCard, UiSkeleton],
  template: `
    <app-page-header [title]="title()" [backLink]="backLink()" [backLabel]="backLabel()" />
    @if (loadFailed()) {
      <ui-alert class="mb-4" retryable [retrying]="loading()" (retry)="reload()">
        No se pudo cargar la cuenta.
      </ui-alert>
    } @else if (failure(); as message) {
      <ui-alert class="mb-4">{{ message }}</ui-alert>
    }
    @if (ready()) {
      <section uiCard padding="lg" class="max-w-2xl">
        <app-account-form
          [account]="account()"
          [settlementCandidates]="candidates()"
          [serverErrors]="serverErrors()"
          [saving]="saving()"
          (submitted)="save($event)"
          (cancelled)="leave()"
        />
      </section>
    } @else if (!loadFailed()) {
      <ui-card padding="lg" class="max-w-2xl">
        <div role="status" aria-live="polite" class="flex flex-col gap-5">
          <span class="sr-only">Cargando formulario</span>
          @for (field of skeletonFields; track field) {
            <div>
              <ui-skeleton width="6rem" />
              <ui-skeleton class="mt-2" height="2.75rem" />
            </div>
          }
        </div>
      </ui-card>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountEditorPage implements OnInit {
  private readonly api = inject(AccountsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(UiToast);

  readonly id = input<string>();

  protected readonly account = signal<Account | null>(null);
  protected readonly candidates = signal<Account[]>([]);
  protected readonly serverErrors = signal<AccountFormErrors>({});
  protected readonly saving = signal(false);
  protected readonly ready = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly loading = signal(false);
  protected readonly skeletonFields = [0, 1, 2, 3];
  protected readonly backLink = computed(() => {
    const id = this.id();
    return id === undefined ? '/cuentas' : `/cuentas/${id}`;
  });
  protected readonly backLabel = computed(() => (this.id() === undefined ? 'Cuentas' : 'Cuenta'));
  protected readonly title = computed(() =>
    this.id() === undefined ? 'Nueva cuenta' : 'Editar cuenta',
  );

  ngOnInit(): void {
    void this.load();
  }

  protected async save(payload: AccountInput): Promise<void> {
    this.saving.set(true);
    this.serverErrors.set({});
    this.failure.set(null);
    try {
      const current = this.account();
      const saved = await firstValueFrom(
        current === null ? this.api.create(payload) : this.api.update(current.id, payload),
      );
      this.toast.success(current === null ? 'Cuenta creada' : 'Cuenta actualizada');
      await this.router.navigate(['/cuentas', saved.id]);
    } catch (error: unknown) {
      this.handleSaveError(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected leave(): void {
    const current = this.account();
    void this.router.navigateByUrl(current === null ? '/cuentas' : `/cuentas/${current.id}`);
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const id = this.id();
      const [candidates, account] = await Promise.all([
        firstValueFrom(this.api.list()),
        id === undefined ? Promise.resolve(null) : firstValueFrom(this.api.get(Number(id))),
      ]);
      this.candidates.set(candidates);
      this.account.set(account);
      this.ready.set(true);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private handleSaveError(error: unknown): void {
    if (conflictCode(error) === 'opening_date_after_movements') {
      this.serverErrors.set({ opening_date: OPENING_DATE_CONFLICT });
      return;
    }
    const fields = validationErrors(error);
    if (fields !== null && Object.keys(fields).some((field) => EDITABLE_FIELDS.has(field))) {
      this.serverErrors.set(fields);
      return;
    }
    this.failure.set(serverMessage(error) ?? 'No se pudo guardar la cuenta. Inténtalo de nuevo.');
  }
}

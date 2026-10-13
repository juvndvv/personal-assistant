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
import { UiToast } from '../../shared/ui';
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
  imports: [AccountForm, PageHeader],
  template: `
    <app-page-header [title]="title()" />
    @if (failure(); as message) {
      <p role="alert" class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {{ message }}
      </p>
    }
    @if (ready()) {
      <section class="rounded-2xl border border-border bg-background p-4 md:p-6">
        <app-account-form
          [account]="account()"
          [settlementCandidates]="candidates()"
          [serverErrors]="serverErrors()"
          [saving]="saving()"
          (submitted)="save($event)"
          (cancelled)="leave()"
        />
      </section>
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

  private async load(): Promise<void> {
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
      this.failure.set('No se pudo cargar la cuenta.');
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

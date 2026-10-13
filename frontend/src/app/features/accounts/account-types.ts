import { ACCOUNT_TYPES, Account, AccountType } from '../../core/api/models';
import { formatDate } from '../../core/date/iso-date';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Cuenta corriente',
  cash: 'Efectivo',
  credit_card: 'Tarjeta de crédito',
  savings_investment: 'Ahorro e inversión',
};

export const ACCOUNT_TYPE_GROUP_LABELS: Record<AccountType, string> = {
  checking: 'Cuentas corrientes',
  cash: 'Efectivo',
  credit_card: 'Tarjetas de crédito',
  savings_investment: 'Ahorro e inversión',
};

export interface AccountGroup {
  type: AccountType;
  label: string;
  accounts: Account[];
  totalCents: number;
}

export function groupAccountsByType(accounts: readonly Account[]): AccountGroup[] {
  return ACCOUNT_TYPES.map((type) => {
    const ofType = accounts.filter((account) => account.type === type);
    return {
      type,
      label: ACCOUNT_TYPE_GROUP_LABELS[type],
      accounts: ofType,
      totalCents: ofType.reduce((total, account) => total + account.balance_cents, 0),
    };
  }).filter((group) => group.accounts.length > 0);
}

export function isArchived(account: Pick<Account, 'archived_at'>): boolean {
  return account.archived_at !== null;
}

export function lastUpdatedLabel(account: Pick<Account, 'last_updated_on'>): string {
  return account.last_updated_on === null
    ? 'Sin movimientos'
    : `Actualizada el ${formatDate(account.last_updated_on, 'medium')}`;
}

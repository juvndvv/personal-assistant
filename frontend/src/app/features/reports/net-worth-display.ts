import { IsoDateString, NetWorthAccount } from '../../core/api/models';
import { formatDate } from '../../core/date/iso-date';

export function netWorthUpdatedLabel(date: IsoDateString | null): string {
  return date === null ? 'Sin movimientos' : `Actualizado el ${formatDate(date, 'medium')}`;
}

export function staleAccountsMessage(accounts: readonly NetWorthAccount[]): string | null {
  const stale = accounts.filter((account) => account.stale && !account.archived);
  if (stale.length === 0) {
    return null;
  }
  const names = stale.map((account) => account.name).join(', ');
  return stale.length === 1
    ? `${names} lleva más de 30 días sin actualizarse. Revisa su saldo.`
    : `${stale.length} cuentas llevan más de 30 días sin actualizarse: ${names}. Revisa sus saldos.`;
}

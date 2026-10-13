import { Transaction, TransactionOrigin, TransactionType } from '../../core/api/models';

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  adjustment: 'Ajuste de saldo',
};

export const TRANSACTION_ORIGIN_LABELS: Record<TransactionOrigin, string> = {
  manual: 'Manual',
  voice: 'Voz',
  photo: 'Foto',
  recurring: 'Fijo',
};

export interface DisplayAmount {
  cents: number;
  signed: boolean;
}

export interface DateGroup {
  date: string;
  items: Transaction[];
  netCents: number;
}

export function transferRoute(transaction: Transaction): string | null {
  const transfer = transaction.transfer;
  if (transfer === null) {
    return null;
  }
  const [from, to] =
    transfer.leg === 'out'
      ? [transaction.account, transfer.counter_account]
      : [transfer.counter_account, transaction.account];
  return `${from.name} → ${to.name}`;
}

export function transactionTitle(transaction: Transaction): string {
  if (transaction.type === 'adjustment') {
    return TRANSACTION_TYPE_LABELS.adjustment;
  }
  return (
    transferRoute(transaction) ??
    transaction.description ??
    transaction.merchant ??
    transaction.category?.name ??
    TRANSACTION_TYPE_LABELS[transaction.type]
  );
}

export function categoryPath(transaction: Transaction): string | null {
  const category = transaction.category;
  if (category === null) {
    return null;
  }
  return category.parent_name === null
    ? category.name
    : `${category.parent_name} › ${category.name}`;
}

export function transactionSubtitle(transaction: Transaction): string {
  if (transaction.transfer !== null) {
    return transaction.transfer.kind === 'card_settlement'
      ? 'Liquidación de tarjeta'
      : TRANSACTION_TYPE_LABELS.transfer;
  }
  const label =
    transaction.type === 'adjustment'
      ? (transaction.note ?? 'Saldo real')
      : (categoryPath(transaction) ?? TRANSACTION_TYPE_LABELS[transaction.type]);
  return `${label} · ${transaction.account.name}`;
}

export function transactionAmount(transaction: Transaction, accountScoped: boolean): DisplayAmount {
  if (transaction.type === 'transfer' && !accountScoped) {
    return { cents: transaction.amount_cents, signed: false };
  }
  return { cents: transaction.signed_amount_cents, signed: true };
}

export function groupByDate(transactions: readonly Transaction[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const transaction of transactions) {
    let group = groups.at(-1);
    if (group?.date !== transaction.date) {
      group = { date: transaction.date, items: [], netCents: 0 };
      groups.push(group);
    }
    group.items.push(transaction);
    if (transaction.type === 'expense' || transaction.type === 'income') {
      group.netCents += transaction.signed_amount_cents;
    }
  }
  return groups;
}

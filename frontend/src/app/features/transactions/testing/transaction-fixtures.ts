import { AccountSummary, Transaction, Transfer } from '../../../core/api/models';

export const BBVA: AccountSummary = { id: 3, name: 'BBVA', type: 'checking', archived: false };
export const SAVINGS: AccountSummary = {
  id: 9,
  name: 'Ahorro',
  type: 'savings_investment',
  archived: false,
};
export const VISA: AccountSummary = { id: 7, name: 'Visa', type: 'credit_card', archived: false };

export function aTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 120,
    type: 'expense',
    account: BBVA,
    amount_cents: 2350,
    signed_amount_cents: -2350,
    date: '2026-10-12',
    category: {
      id: 11,
      name: 'Supermercado',
      kind: 'expense',
      parent_id: 10,
      parent_name: 'Alimentación',
    },
    description: 'Compra semanal',
    merchant: 'Mercadona',
    note: null,
    origin: 'manual',
    tags: [],
    transfer: null,
    adjustment_target_cents: null,
    recurring_template_id: null,
    attachments_count: 0,
    created_at: '2026-10-12T19:02:11+02:00',
    updated_at: '2026-10-12T19:02:11+02:00',
    ...overrides,
  };
}

export function aTransferLeg(overrides: Partial<Transaction> = {}): Transaction {
  return aTransaction({
    id: 130,
    type: 'transfer',
    account: BBVA,
    amount_cents: 10000,
    signed_amount_cents: -10000,
    category: null,
    description: null,
    merchant: null,
    transfer: { id: 44, kind: 'transfer', leg: 'out', counter_account: SAVINGS },
    ...overrides,
  });
}

export function aTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 44,
    kind: 'transfer',
    from_account: BBVA,
    to_account: SAVINGS,
    amount_cents: 10000,
    date: '2026-10-01',
    note: null,
    origin: 'manual',
    out_transaction_id: 130,
    in_transaction_id: 131,
    created_at: '2026-10-01T10:00:00+02:00',
    ...overrides,
  };
}

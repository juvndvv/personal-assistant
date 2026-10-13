import { Account } from '../../../core/api/models';

export function anAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    name: 'BBVA',
    type: 'checking',
    opening_balance_cents: 0,
    opening_date: '2026-01-01',
    statement_day: null,
    settlement_account_id: null,
    sort_order: 0,
    archived_at: null,
    balance_cents: 0,
    last_movement_date: null,
    last_adjustment_date: null,
    last_updated_on: '2026-10-12',
    stale: false,
    created_at: '2026-10-13T08:00:00+02:00',
    ...overrides,
  };
}

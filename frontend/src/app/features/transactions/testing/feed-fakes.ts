import { Transaction, TransactionPage } from '../../../core/api/models';

export function aPage(
  data: Transaction[],
  overrides: Partial<TransactionPage['meta']> = {},
): TransactionPage {
  return {
    data,
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 50,
      total: data.length,
      from: data.length === 0 ? null : 1,
      to: data.length === 0 ? null : data.length,
      totals: { income_cents: 0, expense_cents: 0 },
      ...overrides,
    },
  };
}

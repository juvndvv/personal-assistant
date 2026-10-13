import { Account } from '../../core/api/models';
import { groupAccountsByType } from './account-types';
import { anAccount } from './testing/account-fixtures';

describe('groupAccountsByType', () => {
  it('groups in type order, skips empty types and sums balances', () => {
    const accounts: Account[] = [
      anAccount({ id: 1, type: 'savings_investment', balance_cents: 500000 }),
      anAccount({ id: 2, type: 'checking', balance_cents: 1000 }),
      anAccount({ id: 3, type: 'checking', balance_cents: -250 }),
    ];

    const groups = groupAccountsByType(accounts);

    expect(groups.map((group) => group.type)).toEqual(['checking', 'savings_investment']);
    expect(groups[0]?.totalCents).toBe(750);
    expect(groups[0]?.label).toBe('Cuentas corrientes');
  });
});

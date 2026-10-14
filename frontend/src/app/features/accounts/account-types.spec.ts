import { Account } from '../../core/api/models';
import {
  balanceLabel,
  balanceToneClass,
  groupAccountsByType,
  groupTotalToneClass,
} from './account-types';
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

describe('balance presentation', () => {
  it('flags overdrawn accounts but keeps card debt neutral', () => {
    expect(balanceToneClass(anAccount({ type: 'checking', balance_cents: -100 }))).toBe(
      'text-danger-text',
    );
    expect(balanceToneClass(anAccount({ type: 'credit_card', balance_cents: -100 }))).toBe(
      'text-foreground',
    );
    expect(balanceToneClass(anAccount({ type: 'cash', balance_cents: 100 }))).toBe(
      'text-foreground',
    );
  });

  it('labels a negative card balance as debt', () => {
    expect(balanceLabel(anAccount({ type: 'credit_card', balance_cents: -100 }))).toBe(
      'Deuda de la tarjeta',
    );
    expect(balanceLabel(anAccount({ type: 'credit_card', balance_cents: 0 }))).toBe('Saldo');
    expect(balanceLabel(anAccount({ type: 'checking', balance_cents: -100 }))).toBe('Saldo');
  });

  it('only highlights a negative group total outside credit cards', () => {
    expect(groupTotalToneClass({ type: 'checking', totalCents: -1 })).toBe('text-danger-text');
    expect(groupTotalToneClass({ type: 'credit_card', totalCents: -1 })).toBe(
      'text-muted-foreground',
    );
  });
});

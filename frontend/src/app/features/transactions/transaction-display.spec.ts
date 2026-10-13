import { BBVA, SAVINGS, aTransaction, aTransferLeg } from './testing/transaction-fixtures';
import {
  groupByDate,
  transactionAmount,
  transactionSubtitle,
  transactionTitle,
} from './transaction-display';

describe('transaction display', () => {
  it('titles an expense by description, then merchant, then category', () => {
    expect(transactionTitle(aTransaction())).toBe('Compra semanal');
    expect(transactionTitle(aTransaction({ description: null }))).toBe('Mercadona');
    expect(transactionTitle(aTransaction({ description: null, merchant: null }))).toBe(
      'Supermercado',
    );
  });

  it('renders a collapsed transfer as source -> destination', () => {
    expect(transactionTitle(aTransferLeg())).toBe('BBVA → Ahorro');
    const inLeg = aTransferLeg({
      account: SAVINGS,
      signed_amount_cents: 10000,
      transfer: { id: 44, kind: 'transfer', leg: 'in', counter_account: BBVA },
    });
    expect(transactionTitle(inLeg)).toBe('BBVA → Ahorro');
  });

  it('labels card settlements and adjustments', () => {
    const settlement = aTransferLeg({
      transfer: {
        id: 45,
        kind: 'card_settlement',
        leg: 'out',
        counter_account: { id: 7, name: 'Visa', type: 'credit_card', archived: false },
      },
    });
    expect(transactionSubtitle(settlement)).toBe('Liquidación de tarjeta');
    expect(
      transactionTitle(aTransaction({ type: 'adjustment', category: null, description: null })),
    ).toBe('Ajuste de saldo');
  });

  it('shows the category path and account as subtitle', () => {
    expect(transactionSubtitle(aTransaction())).toBe('Alimentación › Supermercado · BBVA');
  });

  it('signs amounts except collapsed transfers', () => {
    expect(transactionAmount(aTransaction(), false)).toEqual({ cents: -2350, signed: true });
    expect(transactionAmount(aTransferLeg(), false)).toEqual({ cents: 10000, signed: false });
    expect(transactionAmount(aTransferLeg(), true)).toEqual({ cents: -10000, signed: true });
  });

  it('groups by date keeping the order and adds day totals', () => {
    const groups = groupByDate([
      aTransaction({ id: 1, date: '2026-10-12', signed_amount_cents: -1000 }),
      aTransaction({ id: 2, date: '2026-10-12', type: 'income', signed_amount_cents: 5000 }),
      aTransferLeg({ id: 3, date: '2026-10-12' }),
      aTransaction({ id: 4, date: '2026-10-10', signed_amount_cents: -200 }),
    ]);
    expect(groups.map((group) => [group.date, group.items.map((item) => item.id)])).toEqual([
      ['2026-10-12', [1, 2, 3]],
      ['2026-10-10', [4]],
    ]);
    expect(groups[0]?.netCents).toBe(4000);
  });
});

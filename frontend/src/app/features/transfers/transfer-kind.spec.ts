import { transferKindBetween } from './transfer-kind';

describe('transferKindBetween', () => {
  it('classifies a payment into a credit card from another account as a card settlement', () => {
    expect(transferKindBetween('checking', 'credit_card')).toBe('card_settlement');
  });

  it('keeps transfers between credit cards and other accounts as plain transfers', () => {
    expect(transferKindBetween('credit_card', 'credit_card')).toBe('transfer');
    expect(transferKindBetween('credit_card', 'checking')).toBe('transfer');
    expect(transferKindBetween('checking', 'savings_investment')).toBe('transfer');
  });
});

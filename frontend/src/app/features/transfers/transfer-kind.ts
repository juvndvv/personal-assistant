import { AccountType, TransferKind } from '../../core/api/models';

export function transferKindBetween(from: AccountType, to: AccountType): TransferKind {
  return to === 'credit_card' && from !== 'credit_card' ? 'card_settlement' : 'transfer';
}

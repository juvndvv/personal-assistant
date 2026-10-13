export interface User {
  id: number;
  name: string;
  email: string;
}

export interface DataEnvelope<T> {
  data: T;
}

export interface ValidationErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}

export interface ConflictErrorBody {
  message: string;
  code: string;
}

export type IsoDateString = string;
export type PeriodLabel = string;

export interface Period {
  label: PeriodLabel;
  start: IsoDateString;
  end: IsoDateString;
  month_start_day: number;
}

export interface Settings {
  month_start_day: number;
  default_account_id: number | null;
  last_used_account_id: number | null;
  orphan_draft_ttl_days: number;
  current_period: Period;
}

export interface SettingsPatch {
  month_start_day?: number;
  default_account_id?: number | null;
  orphan_draft_ttl_days?: number;
}

export const ACCOUNT_TYPES = ['checking', 'cash', 'credit_card', 'savings_investment'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  opening_balance_cents: number;
  opening_date: IsoDateString;
  statement_day: number | null;
  settlement_account_id: number | null;
  sort_order: number;
  archived_at: string | null;
  balance_cents: number;
  last_movement_date: IsoDateString | null;
  last_adjustment_date: IsoDateString | null;
  last_updated_on: IsoDateString | null;
  stale: boolean;
  created_at: string;
}

export interface AccountSummary {
  id: number;
  name: string;
  type: AccountType;
  archived: boolean;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  opening_balance_cents: number;
  opening_date: IsoDateString;
  statement_day?: number | null;
  settlement_account_id?: number | null;
  sort_order?: number;
}

export type AccountPatch = Partial<AccountInput>;

export interface AccountBalance {
  account_id: number;
  date: IsoDateString;
  balance_cents: number;
}

export interface BalanceAdjustmentInput {
  date: IsoDateString;
  target_balance_cents: number;
  note?: string | null;
}

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface Category {
  id: number;
  kind: CategoryKind;
  name: string;
  parent_id: number | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  archived_at: string | null;
  children: Category[];
}

export interface CategorySummary {
  id: number;
  name: string;
  kind: CategoryKind;
  parent_id: number | null;
  parent_name: string | null;
}

export interface CategoryInput {
  kind: CategoryKind;
  name: string;
  parent_id?: number | null;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface CategoryPatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
  parent_id?: number | null;
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'adjustment';
export type TransactionOrigin = 'manual' | 'voice' | 'photo' | 'recurring';

export interface TagSummary {
  id: number;
  name: string;
}

export interface TransactionTransfer {
  id: number;
  kind: 'transfer' | 'card_settlement';
  leg: 'out' | 'in';
  counter_account: AccountSummary;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  account: AccountSummary;
  amount_cents: number;
  signed_amount_cents: number;
  date: IsoDateString;
  category: CategorySummary | null;
  description: string | null;
  merchant: string | null;
  note: string | null;
  origin: TransactionOrigin;
  tags: TagSummary[];
  transfer: TransactionTransfer | null;
  adjustment_target_cents: number | null;
  recurring_template_id: number | null;
  attachments_count: number;
  created_at: string;
  updated_at: string;
}

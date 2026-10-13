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

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  'expense',
  'income',
  'transfer',
  'adjustment',
];
export const TRANSACTION_ORIGINS: readonly TransactionOrigin[] = [
  'manual',
  'voice',
  'photo',
  'recurring',
];

export type EntryType = Extract<TransactionType, 'expense' | 'income'>;
export type TransferKind = 'transfer' | 'card_settlement';
export type TagMode = 'any' | 'all';
export type TransactionSort = '-date' | 'date' | '-amount' | 'amount';

export interface Tag {
  id: number;
  name: string;
  usage_count?: number;
}

export interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export interface Paginated<T, M extends PageMeta = PageMeta> {
  data: T[];
  meta: M;
}

export interface TransactionTotals {
  income_cents: number;
  expense_cents: number;
}

export interface TransactionPageMeta extends PageMeta {
  totals: TransactionTotals;
}

export type TransactionPage = Paginated<Transaction, TransactionPageMeta>;

export interface TransactionListQuery {
  q?: string;
  type?: readonly TransactionType[];
  account_id?: readonly number[];
  category_id?: readonly number[];
  tag_id?: readonly number[];
  tag_mode?: TagMode;
  origin?: readonly TransactionOrigin[];
  period?: PeriodLabel;
  date_from?: IsoDateString;
  date_to?: IsoDateString;
  amount_min_cents?: number;
  amount_max_cents?: number;
  has_attachments?: boolean;
  sort?: TransactionSort;
  page?: number;
  per_page?: number;
}

export interface TransactionInput {
  type: EntryType;
  amount_cents: number;
  category_id: number;
  date?: IsoDateString;
  account_id?: number;
  description?: string | null;
  merchant?: string | null;
  note?: string | null;
  tags?: string[];
  draft_id?: number | null;
}

export interface EntryPatch {
  type?: EntryType;
  amount_cents?: number;
  date?: IsoDateString;
  account_id?: number;
  category_id?: number;
  description?: string | null;
  merchant?: string | null;
  note?: string | null;
  tags?: string[];
}

export interface AdjustmentPatch {
  date?: IsoDateString;
  target_balance_cents?: number;
  note?: string | null;
}

export type TransactionPatch = EntryPatch | AdjustmentPatch;

export interface Transfer {
  id: number;
  kind: TransferKind;
  from_account: AccountSummary;
  to_account: AccountSummary;
  amount_cents: number;
  date: IsoDateString;
  note: string | null;
  origin: TransactionOrigin;
  out_transaction_id: number;
  in_transaction_id: number;
  created_at: string;
}

export interface TransferInput {
  kind?: TransferKind;
  from_account_id: number;
  to_account_id: number;
  amount_cents: number;
  date?: IsoDateString;
  note?: string | null;
  draft_id?: number | null;
}

export type TransferPatch = Partial<Omit<TransferInput, 'draft_id'>>;

export interface SettlementSuggestion {
  card_account_id: number;
  statement_start: IsoDateString | null;
  statement_end: IsoDateString | null;
  statement_balance_cents: number;
  settled_since_cents: number;
  suggested_cents: number;
  from_account_id: number | null;
}

export interface QuickAddDefaults {
  date: IsoDateString;
  account_id: number | null;
  frequent_category_ids: Record<EntryType, number[]>;
}

export type AttachmentKind = 'audio' | 'image';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  mime: string;
  size_bytes: number;
  original_name: string | null;
  url: string;
  download_url: string;
  created_at: string;
}

export type CaptureKind = 'voice' | 'photo';
export type CaptureStatus = 'processing' | 'completed' | 'failed';

export interface Capture {
  id: string;
  kind: CaptureKind;
  status: CaptureStatus;
  transcript: string | null;
  error: string | null;
  transcription_ms: number | null;
  extraction_ms: number | null;
  attachments: Attachment[];
  created_at: string;
}

export type DraftOrigin = 'voice' | 'photo' | 'recurring';
export type DraftStatus = 'pending' | 'confirmed' | 'discarded';
export type DraftType = 'expense' | 'income' | 'transfer';
export type FieldSource = 'ai' | 'history' | 'template' | 'default';

export const DRAFT_FIELDS = [
  'type',
  'amount_cents',
  'date',
  'account_id',
  'to_account_id',
  'category_id',
  'description',
  'merchant',
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

export interface DraftProposal {
  type: DraftType | null;
  amount_cents: number | null;
  date: IsoDateString | null;
  account_id: number | null;
  to_account_id: number | null;
  category_id: number | null;
  description: string | null;
  merchant: string | null;
}

export interface DraftRecurring {
  template_id: number;
  template_name: string;
  occurrence_id: number;
  due_date: IsoDateString;
  is_variable: boolean;
}

export interface Draft {
  id: number;
  origin: DraftOrigin;
  status: DraftStatus;
  proposal: DraftProposal;
  confidence: Partial<Record<DraftField, number>>;
  field_sources: Partial<Record<DraftField, FieldSource>>;
  low_confidence_fields: DraftField[];
  capture: Capture | null;
  recurring: DraftRecurring | null;
  transaction_id: number | null;
  transfer_id: number | null;
  corrected_fields: string[] | null;
  confirmed_at: string | null;
  discarded_at: string | null;
  created_at: string;
}

export interface CaptureResult {
  capture: Capture;
  draft: Draft;
}

export interface CaptureUpload {
  kind: CaptureKind;
  file: Blob;
  filename: string;
  clientStartedAt?: string;
}

export interface DraftListQuery {
  status?: DraftStatus;
  origin?: readonly DraftOrigin[];
  page?: number;
  per_page?: number;
}

export const RECURRING_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export type RecurringType = EntryType;

export interface RecurringTemplate {
  id: number;
  name: string;
  type: RecurringType;
  amount_cents: number;
  is_variable: boolean;
  account: AccountSummary;
  category: CategorySummary;
  frequency: RecurringFrequency;
  day_of_month: number;
  starts_on: IsoDateString;
  ends_on: IsoDateString | null;
  description: string | null;
  merchant: string | null;
  note: string | null;
  paused_at: string | null;
  next_due_date: IsoDateString | null;
  created_at: string;
}

export interface RecurringTemplateInput {
  name: string;
  type: RecurringType;
  amount_cents: number;
  is_variable: boolean;
  account_id: number;
  category_id: number;
  frequency: RecurringFrequency;
  day_of_month: number;
  starts_on: IsoDateString;
  ends_on: IsoDateString | null;
  description: string | null;
  merchant: string | null;
  note?: string | null;
}

export type RecurringTemplatePatch = Partial<RecurringTemplateInput>;

export type ForecastStatus = 'upcoming' | 'awaiting_amount' | 'posted' | 'skipped';

export interface ForecastItem {
  template_id: number;
  template_name: string;
  type: RecurringType;
  due_date: IsoDateString;
  amount_cents: number;
  is_variable: boolean;
  status: ForecastStatus;
  draft_id: number | null;
  transaction_id: number | null;
}

export interface RecurringForecast {
  period: Period;
  items: ForecastItem[];
  pending_expense_cents: number;
  pending_income_cents: number;
  posted_expense_cents: number;
  posted_income_cents: number;
}

export interface CategoryBreakdownChild {
  category_id: number;
  name: string;
  amount_cents: number;
  share_bp: number;
}

export interface CategoryBreakdownNode extends CategoryBreakdownChild {
  own_cents: number;
  children: CategoryBreakdownChild[];
}

export interface PeriodSummary {
  period: Period;
  income_cents: number;
  expense_cents: number;
  net_cents: number;
  savings_rate_bp: number | null;
  by_category: Record<CategoryKind, CategoryBreakdownNode[]>;
}

export interface TrendPoint {
  period: Period;
  income_cents: number;
  expense_cents: number;
  savings_rate_bp: number | null;
  category_cents?: number;
}

export interface TrendQuery {
  periods?: number;
  until?: PeriodLabel;
  category_id?: number;
}

export interface NetWorthAccount {
  id: number;
  name: string;
  type: AccountType;
  archived: boolean;
  balance_cents: number;
  last_updated_on: IsoDateString | null;
  stale: boolean;
}

export interface NetWorth {
  date: IsoDateString;
  total_cents: number;
  assets_cents: number;
  liabilities_cents: number;
  accounts: NetWorthAccount[];
}

export interface CaptureMetrics {
  period: Period;
  captures_confirmed: number;
  median_seconds_to_confirm: number | null;
  p90_seconds_to_confirm: number | null;
  unedited_share_bp: number | null;
  active_days: number;
  elapsed_days: number;
  active_days_per_week: number | null;
}

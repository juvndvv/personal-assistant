import { validationErrors } from '../../core/api/api-error';

export const ENTRY_FIELDS = [
  'type',
  'amount_cents',
  'category_id',
  'date',
  'account_id',
  'description',
  'merchant',
  'note',
  'tags',
  'target_balance_cents',
  'from_account_id',
  'to_account_id',
  'kind',
] as const;

export type EntryField = (typeof ENTRY_FIELDS)[number];
export type EntryErrors = Partial<Record<EntryField, string>>;

export function entryErrorsFrom(error: unknown): EntryErrors | null {
  const fields = validationErrors(error);
  if (fields === null) {
    return null;
  }
  const known: EntryErrors = {};
  for (const [field, message] of Object.entries(fields)) {
    const key = field.startsWith('tags') ? 'tags' : field;
    if ((ENTRY_FIELDS as readonly string[]).includes(key)) {
      known[key as EntryField] ??= message;
    }
  }
  return known;
}

export function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

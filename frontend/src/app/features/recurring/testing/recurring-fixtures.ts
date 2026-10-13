import { of } from 'rxjs';
import {
  Draft,
  ForecastItem,
  RecurringForecast,
  RecurringTemplate,
} from '../../../core/api/models';
import { aDraft } from '../../drafts/testing/draft-fixtures';

export function aRecurringTemplate(overrides: Partial<RecurringTemplate> = {}): RecurringTemplate {
  return {
    id: 4,
    name: 'Luz',
    type: 'expense',
    amount_cents: 6000,
    is_variable: true,
    account: { id: 3, name: 'BBVA', type: 'checking', archived: false },
    category: {
      id: 21,
      name: 'Electricidad',
      kind: 'expense',
      parent_id: 20,
      parent_name: 'Vivienda',
    },
    frequency: 'monthly',
    day_of_month: 5,
    starts_on: '2026-01-01',
    ends_on: null,
    description: 'Iberdrola',
    merchant: 'Iberdrola',
    note: null,
    paused_at: null,
    next_due_date: '2026-11-05',
    created_at: '2026-01-01T10:00:00+01:00',
    ...overrides,
  };
}

export function aForecastItem(overrides: Partial<ForecastItem> = {}): ForecastItem {
  return {
    template_id: 4,
    template_name: 'Luz',
    type: 'expense',
    due_date: '2026-10-05',
    amount_cents: 6000,
    is_variable: true,
    status: 'awaiting_amount',
    draft_id: 91,
    transaction_id: null,
    ...overrides,
  };
}

export function aForecast(overrides: Partial<RecurringForecast> = {}): RecurringForecast {
  return {
    period: { label: '2026-10', start: '2026-09-25', end: '2026-10-24', month_start_day: 25 },
    items: [aForecastItem()],
    pending_expense_cents: 6000,
    pending_income_cents: 0,
    posted_expense_cents: 85000,
    posted_income_cents: 210000,
    ...overrides,
  };
}

export function aRecurringDraft(overrides: Partial<Draft> = {}): Draft {
  return aDraft({
    id: 91,
    origin: 'recurring',
    proposal: {
      type: 'expense',
      amount_cents: 6000,
      date: '2026-10-05',
      account_id: 3,
      to_account_id: null,
      category_id: 21,
      description: 'Iberdrola',
      merchant: 'Iberdrola',
    },
    confidence: { amount_cents: 0.5 },
    field_sources: { amount_cents: 'template' },
    low_confidence_fields: ['amount_cents'],
    capture: null,
    recurring: {
      template_id: 4,
      template_name: 'Luz',
      occurrence_id: 31,
      due_date: '2026-10-05',
      is_variable: true,
    },
    ...overrides,
  });
}

export function quietRecurringApi(forecast: RecurringForecast = aForecast({ items: [] })) {
  return {
    list: () => of([]),
    forecast: () => of(forecast),
  };
}

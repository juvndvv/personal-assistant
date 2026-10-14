import { of } from 'rxjs';
import {
  CaptureMetrics,
  NetWorth,
  NetWorthAccount,
  Period,
  PeriodSummary,
  TrendPoint,
} from '../../../core/api/models';

export function aPeriod(label = '2026-10', overrides: Partial<Period> = {}): Period {
  const [year, month] = label.split('-').map(Number) as [number, number];
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return {
    label,
    start: `${previousYear}-${String(previousMonth).padStart(2, '0')}-25`,
    end: `${year}-${String(month).padStart(2, '0')}-24`,
    month_start_day: 25,
    ...overrides,
  };
}

export function aSummary(overrides: Partial<PeriodSummary> = {}): PeriodSummary {
  return {
    period: aPeriod(),
    income_cents: 210000,
    expense_cents: 157500,
    net_cents: 52500,
    savings_rate_bp: 2500,
    by_category: {
      expense: [
        {
          category_id: 10,
          name: 'Alimentación',
          amount_cents: 42000,
          share_bp: 2667,
          own_cents: 2000,
          children: [
            { category_id: 11, name: 'Supermercado', amount_cents: 40000, share_bp: 2540 },
          ],
        },
        {
          category_id: 20,
          name: 'Vivienda',
          amount_cents: 91000,
          share_bp: 5778,
          own_cents: 85000,
          children: [{ category_id: 21, name: 'Electricidad', amount_cents: 6000, share_bp: 381 }],
        },
        {
          category_id: 30,
          name: 'Ocio',
          amount_cents: 24500,
          share_bp: 1555,
          own_cents: 24500,
          children: [],
        },
      ],
      income: [
        {
          category_id: 50,
          name: 'Nómina',
          amount_cents: 210000,
          share_bp: 10000,
          own_cents: 210000,
          children: [],
        },
      ],
    },
    ...overrides,
  };
}

export function aTrend(count = 12, until = '2026-10'): TrendPoint[] {
  const [year, month] = until.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index;
    const absolute = year * 12 + (month - 1) - offset;
    const label = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`;
    const income = index === 0 ? 0 : 200000;
    const expense = 150000 + index * 1000;
    return {
      period: aPeriod(label),
      income_cents: income,
      expense_cents: expense,
      savings_rate_bp: income === 0 ? null : Math.round(((income - expense) * 10000) / income),
    };
  });
}

export function aNetWorthAccount(overrides: Partial<NetWorthAccount> = {}): NetWorthAccount {
  return {
    id: 3,
    name: 'BBVA',
    type: 'checking',
    archived: false,
    balance_cents: 234567,
    last_updated_on: '2026-10-12',
    stale: false,
    ...overrides,
  };
}

export function aNetWorth(overrides: Partial<NetWorth> = {}): NetWorth {
  return {
    date: '2026-10-13',
    total_cents: 1834500,
    assets_cents: 1879730,
    liabilities_cents: -45230,
    accounts: [
      aNetWorthAccount(),
      aNetWorthAccount({
        id: 4,
        name: 'Hucha',
        type: 'cash',
        balance_cents: 12000,
        last_updated_on: '2026-08-01',
        stale: true,
      }),
      aNetWorthAccount({
        id: 5,
        name: 'Visa',
        type: 'credit_card',
        balance_cents: -45230,
        last_updated_on: '2026-10-10',
      }),
      aNetWorthAccount({
        id: 6,
        name: 'Fondo',
        type: 'savings_investment',
        balance_cents: 1633163,
        last_updated_on: null,
        stale: true,
      }),
    ],
    ...overrides,
  };
}

export function aCaptureMetrics(overrides: Partial<CaptureMetrics> = {}): CaptureMetrics {
  return {
    period: aPeriod(),
    captures_confirmed: 34,
    median_seconds_to_confirm: 8.4,
    p90_seconds_to_confirm: 14,
    unedited_share_bp: 8235,
    active_days: 22,
    elapsed_days: 26,
    active_days_per_week: 5.9,
    ...overrides,
  };
}

export function quietReportsApi() {
  return {
    summary: (period?: string) =>
      of(aSummary(period === undefined ? {} : { period: aPeriod(period) })),
    trend: () => of(aTrend()),
    netWorth: () => of(aNetWorth()),
    captureMetrics: () => of(aCaptureMetrics()),
    budgetVsActual: (period?: string) =>
      of({
        period: aPeriod(period ?? '2026-10'),
        items: [],
        budgeted_cents: 0,
        actual_budgeted_cents: 0,
        unbudgeted_actual_cents: 0,
      }),
  };
}

import { ForecastStatus, RecurringFrequency, RecurringTemplate } from '../../core/api/models';

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export const FORECAST_STATUS_LABELS: Record<ForecastStatus, string> = {
  upcoming: 'Próximo',
  awaiting_amount: 'Falta el importe',
  posted: 'Registrado',
  skipped: 'Omitido',
};

export function scheduleSummary(template: RecurringTemplate): string {
  return `${FREQUENCY_LABELS[template.frequency]} · día ${template.day_of_month} · ${template.account.name}`;
}

export function isPaused(template: RecurringTemplate): boolean {
  return template.paused_at !== null;
}

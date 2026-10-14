import { Draft, DraftOrigin, FieldSource } from '../../core/api/models';

export const DRAFT_NOT_PENDING_MESSAGE = 'Este borrador ya se confirmó o se descartó.';

export const RECURRING_DRAFT_PROMPT = 'Introduce el importe real';

export const FIELD_SOURCE_LABEL: Record<FieldSource, string> = {
  ai: 'IA',
  default: 'Por defecto',
  history: 'De tu historial',
  template: 'Plantilla',
};

export const DRAFT_ORIGIN_LABEL: Record<DraftOrigin, string> = {
  voice: 'Voz',
  photo: 'Foto',
  recurring: 'Fijo',
};

export const DRAFT_ORIGIN_ICON: Record<DraftOrigin, string> = {
  voice: 'lucideMic',
  photo: 'lucideCamera',
  recurring: 'lucideRepeat',
};

export function draftTitle(draft: Draft): string {
  return (
    draft.recurring?.template_name ??
    draft.proposal.merchant ??
    draft.proposal.description ??
    draft.capture?.transcript ??
    'Sin descripción'
  );
}

export function isRecurringDraft(draft: Draft): boolean {
  return draft.origin === 'recurring' && draft.recurring !== null;
}

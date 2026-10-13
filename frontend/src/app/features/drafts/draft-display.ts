import { Draft, DraftOrigin, FieldSource } from '../../core/api/models';

export const FIELD_SOURCE_LABEL: Record<FieldSource, string> = {
  ai: 'IA',
  default: 'Por defecto',
  history: 'Sugerida',
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

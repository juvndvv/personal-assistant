import { of } from 'rxjs';
import { Attachment, Capture, Draft, Paginated } from '../../../core/api/models';

export function anAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: '01JATTACHMENT0000000000001',
    kind: 'image',
    mime: 'image/jpeg',
    size_bytes: 182334,
    original_name: 'ticket.jpg',
    url: '/api/v1/attachments/01JATTACHMENT0000000000001',
    download_url: '/api/v1/attachments/01JATTACHMENT0000000000001?download=1',
    created_at: '2026-10-12T19:02:00+02:00',
    ...overrides,
  };
}

export function aCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: '01JCAPTURE00000000000000001',
    kind: 'voice',
    status: 'completed',
    transcript: 'Veinte euros en Mercadona con la Visa',
    error: null,
    transcription_ms: 900,
    extraction_ms: 2100,
    attachments: [
      anAttachment({
        id: '01JAUDIO0000000000000000001',
        kind: 'audio',
        mime: 'audio/webm',
        original_name: 'voz.webm',
        url: '/api/v1/attachments/01JAUDIO0000000000000000001',
        download_url: '/api/v1/attachments/01JAUDIO0000000000000000001?download=1',
      }),
    ],
    created_at: '2026-10-12T19:01:58+02:00',
    ...overrides,
  };
}

export function aDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 88,
    origin: 'voice',
    status: 'pending',
    proposal: {
      type: 'expense',
      amount_cents: 2000,
      date: '2026-10-12',
      account_id: 7,
      to_account_id: null,
      category_id: 11,
      description: 'Mercadona',
      merchant: 'Mercadona',
    },
    confidence: {
      type: 0.95,
      amount_cents: 0.98,
      date: 0.6,
      account_id: 0.9,
      category_id: 0.55,
      description: 0.9,
      merchant: 0.9,
    },
    field_sources: {
      type: 'ai',
      amount_cents: 'ai',
      date: 'default',
      account_id: 'ai',
      category_id: 'ai',
      description: 'ai',
      merchant: 'ai',
    },
    low_confidence_fields: ['category_id'],
    capture: aCapture(),
    recurring: null,
    transaction_id: null,
    transfer_id: null,
    corrected_fields: null,
    confirmed_at: null,
    discarded_at: null,
    created_at: '2026-10-12T19:02:00+02:00',
    ...overrides,
  };
}

export function aDraftPage(data: Draft[], total = data.length): Paginated<Draft> {
  return {
    data,
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 50,
      total,
      from: data.length === 0 ? null : 1,
      to: data.length === 0 ? null : data.length,
    },
  };
}

export function quietDraftsApi(total = 0) {
  return {
    list: () => of(aDraftPage([], total)),
    get: () => of(aDraft()),
    discard: () => of(aDraft({ status: 'discarded' })),
  };
}

export function quietAttachmentsApi(receipts: Attachment[] = []) {
  return {
    listForTransaction: () => of(receipts),
    addToTransaction: () => of(anAttachment()),
    delete: () => of(undefined),
  };
}

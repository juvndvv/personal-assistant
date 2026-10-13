import { Page, Route, expect, test } from '@playwright/test';
import { authenticatedStatePath } from './auth-state';

interface Reference {
  accountId: number;
  categoryId: number;
}

interface StubDraft {
  id: number;
  origin: 'voice' | 'photo';
  status: 'pending' | 'confirmed' | 'discarded';
  proposal: Record<string, unknown>;
  confidence: Record<string, number>;
  field_sources: Record<string, string>;
  low_confidence_fields: string[];
  capture: Record<string, unknown>;
  recurring: null;
  transaction_id: number | null;
  transfer_id: null;
  corrected_fields: null;
  confirmed_at: string | null;
  discarded_at: string | null;
  created_at: string;
}

interface CaptureStub {
  drafts: Map<number, StubDraft>;
  uploads: { kind: string; filename: string; contentType: string }[];
  confirmedDraftIds: number[];
  discardedDraftIds: number[];
}

const TRANSCRIPT = 'Doce con cincuenta en la panadería';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function fakeMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeRecorder {
      static isTypeSupported(mime: string): boolean {
        return mime === 'audio/mp4';
      }
      state = 'inactive';
      mimeType = 'audio/mp4';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start(): void {
        this.state = 'recording';
      }
      stop(): void {
        this.state = 'inactive';
        setTimeout(() => {
          this.ondataavailable?.({ data: new Blob(['fake-voice'], { type: 'audio/mp4' }) });
          this.onstop?.();
        }, 0);
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeRecorder });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [] }) },
    });
  });
}

async function referenceData(page: Page): Promise<Reference> {
  await page.goto('/');
  return page.evaluate(async () => {
    const headers = { Accept: 'application/json' };
    const accounts = (await (await fetch('/api/v1/accounts', { headers })).json()) as {
      data: { id: number; archived_at: string | null }[];
    };
    const categories = (await (
      await fetch('/api/v1/categories?kind=expense', { headers })
    ).json()) as { data: { id: number }[] };
    const account = accounts.data.find((candidate) => candidate.archived_at === null);
    const category = categories.data[0];
    if (account === undefined || category === undefined) {
      throw new Error('The M3 journey needs an account and an expense category (run M1/M2 first)');
    }
    return { accountId: account.id, categoryId: category.id };
  });
}

function stubDraft(id: number, kind: 'voice' | 'photo', reference: Reference): StubDraft {
  const attachmentId = `e2e-${kind}-${id}`;
  return {
    id,
    origin: kind,
    status: 'pending',
    proposal: {
      type: 'expense',
      amount_cents: 1250,
      date: madridToday(),
      account_id: reference.accountId,
      to_account_id: null,
      category_id: reference.categoryId,
      description: kind === 'voice' ? 'Panadería' : 'Ticket supermercado',
      merchant: 'Panadería',
    },
    confidence: { amount_cents: 0.95, category_id: 0.4, date: 1, account_id: 0.9 },
    field_sources: {
      type: 'ai',
      amount_cents: 'ai',
      date: 'default',
      account_id: 'default',
      category_id: 'ai',
      description: 'ai',
      merchant: 'ai',
    },
    low_confidence_fields: ['category_id'],
    capture: {
      id: `e2e-capture-${id}`,
      kind,
      status: 'completed',
      transcript: kind === 'voice' ? TRANSCRIPT : null,
      error: null,
      transcription_ms: kind === 'voice' ? 800 : null,
      extraction_ms: 1500,
      attachments: [
        {
          id: attachmentId,
          kind: kind === 'voice' ? 'audio' : 'image',
          mime: kind === 'voice' ? 'audio/mp4' : 'image/png',
          size_bytes: 10,
          original_name: kind === 'voice' ? 'voz.m4a' : 'ticket.png',
          url: `/api/v1/attachments/${attachmentId}`,
          download_url: `/api/v1/attachments/${attachmentId}?download=1`,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
    },
    recurring: null,
    transaction_id: null,
    transfer_id: null,
    corrected_fields: null,
    confirmed_at: null,
    discarded_at: null,
    created_at: new Date().toISOString(),
  };
}

function multipartField(body: string, name: string): string | null {
  const match = new RegExp(`name="${name}"(?:; filename="([^"]*)")?\\r\\n`).exec(body);
  if (match === null) {
    return null;
  }
  if (match[1] !== undefined) {
    return match[1];
  }
  const start = match.index + match[0].length;
  const valueStart = body.indexOf('\r\n\r\n', start - 2) + 4;
  return body.slice(valueStart, body.indexOf('\r\n', valueStart));
}

function pageOf(drafts: StubDraft[]) {
  return {
    data: drafts,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 50,
      total: drafts.length,
      from: drafts.length === 0 ? null : 1,
      to: drafts.length === 0 ? null : drafts.length,
    },
  };
}

async function stubCaptureApi(
  page: Page,
  reference: Reference,
  options: { failed?: boolean } = {},
): Promise<CaptureStub> {
  const stub: CaptureStub = {
    drafts: new Map(),
    uploads: [],
    confirmedDraftIds: [],
    discardedDraftIds: [],
  };
  let nextId = 900_000 + Math.floor(Math.random() * 90_000);
  const pending = () => [...stub.drafts.values()].filter((draft) => draft.status === 'pending');

  await page.route('**/api/v1/captures', async (route: Route) => {
    const request = route.request();
    const body = request.postDataBuffer()?.toString('latin1') ?? '';
    const kind = multipartField(body, 'kind') === 'photo' ? 'photo' : 'voice';
    const contentType = /Content-Type: ([^\r\n]+)/.exec(body)?.[1] ?? '';
    stub.uploads.push({ kind, filename: multipartField(body, 'file') ?? '', contentType });
    nextId += 1;
    const draft = stubDraft(nextId, kind, reference);
    if (options.failed === true) {
      draft.proposal = {
        type: 'expense',
        amount_cents: null,
        date: madridToday(),
        account_id: reference.accountId,
        to_account_id: null,
        category_id: null,
        description: TRANSCRIPT,
        merchant: null,
      };
      draft.low_confidence_fields = ['amount_cents', 'category_id'];
      draft.capture = { ...draft.capture, status: 'failed', error: 'Provider timeout' };
    }
    stub.drafts.set(draft.id, draft);
    await route.fulfill({
      status: 201,
      json: { data: { capture: draft.capture, draft } },
    });
  });

  await page.route(/\/api\/v1\/drafts(\?.*)?$/, (route) =>
    route.fulfill({ json: pageOf(pending()) }),
  );

  await page.route(/\/api\/v1\/drafts\/\d+(\/discard)?$/, async (route) => {
    const url = new URL(route.request().url());
    const id = Number(/\/drafts\/(\d+)/.exec(url.pathname)?.[1]);
    const draft = stub.drafts.get(id);
    if (draft === undefined) {
      await route.fulfill({ status: 404, json: { message: 'Not found' } });
      return;
    }
    if (url.pathname.endsWith('/discard')) {
      draft.status = 'discarded';
      draft.discarded_at = new Date().toISOString();
      stub.discardedDraftIds.push(id);
    }
    await route.fulfill({ json: { data: draft } });
  });

  await page.route('**/api/v1/attachments/e2e-*', (route) =>
    route.fulfill({
      status: 200,
      contentType: route.request().url().includes('photo') ? 'image/png' : 'audio/mp4',
      body: route.request().url().includes('photo') ? TINY_PNG : Buffer.from('fake'),
    }),
  );

  await page.route('**/api/v1/transactions', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const payload = request.postDataJSON() as Record<string, unknown>;
    const draftId = payload['draft_id'];
    const draft = typeof draftId === 'number' ? stub.drafts.get(draftId) : undefined;
    if (draft === undefined) {
      await route.continue();
      return;
    }
    const forwarded = { ...payload };
    delete forwarded['draft_id'];
    const response = await route.fetch({ postData: JSON.stringify(forwarded) });
    if (response.ok()) {
      draft.status = 'confirmed';
      draft.confirmed_at = new Date().toISOString();
      stub.confirmedDraftIds.push(draft.id);
    }
    await route.fulfill({ response });
  });

  return stub;
}

function plusButton(page: Page) {
  return page.getByRole('button', { name: 'Añadir movimiento' }).filter({ visible: true });
}

function quickAdd(page: Page) {
  return page.getByRole('dialog', { name: 'Nuevo movimiento' });
}

test.describe('M3 capture journey', () => {
  test.use({ storageState: authenticatedStatePath, serviceWorkers: 'block' });

  test('voice note becomes an editable draft that is confirmed into the ledger', async ({
    page,
  }) => {
    await fakeMicrophone(page);
    const reference = await referenceData(page);
    const stub = await stubCaptureApi(page, reference);
    const description = `Pan E2E ${uniqueSuffix()}`;

    await page.goto('/movimientos');
    await plusButton(page).click();
    const sheet = quickAdd(page);
    await expect(sheet.getByRole('textbox', { name: 'Importe' })).toBeFocused();
    await sheet.getByRole('button', { name: 'Voz' }).click();
    await expect(sheet.getByTestId('voice-recording')).toBeVisible();
    await sheet.getByRole('button', { name: 'Enviar audio' }).click();

    await expect(page).toHaveURL(/\/pendientes\/\d+$/);
    expect(stub.uploads).toEqual([
      { kind: 'voice', filename: 'voz.m4a', contentType: 'audio/mp4' },
    ]);
    await expect(page.getByRole('heading', { name: 'Revisar movimiento' })).toBeVisible();
    await expect(page.getByTestId('draft-transcript')).toContainText(TRANSCRIPT);
    const categoryField = page.locator('app-review-field[data-field="category_id"]');
    await expect(categoryField).toHaveAttribute('data-low-confidence', 'true');
    await expect(categoryField.getByText('Revisa este dato')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Importe' })).toHaveValue('12,50');

    await page.getByRole('textbox', { name: 'Descripción' }).fill(description);
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page).toHaveURL(/\/movimientos$/);
    expect(stub.confirmedDraftIds).toHaveLength(1);
    await page.getByRole('textbox', { name: 'Buscar' }).fill(description);
    const row = page.getByTestId('transaction-row').filter({ hasText: description });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('transaction-amount')).toHaveText('-12,50 €');
  });

  test('ticket photo becomes a pending draft shown in the inbox and can be discarded', async ({
    page,
  }) => {
    const reference = await referenceData(page);
    const stub = await stubCaptureApi(page, reference);

    await page.goto('/movimientos');
    await plusButton(page).click();
    const sheet = quickAdd(page);
    await sheet
      .getByLabel('Foto del ticket')
      .setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: TINY_PNG });

    await expect(page).toHaveURL(/\/pendientes\/\d+$/);
    expect(stub.uploads[0]?.kind).toBe('photo');
    expect(stub.uploads[0]?.contentType).toMatch(/^image\/(jpeg|png)$/);
    await expect(page.getByRole('img', { name: 'Foto del ticket' })).toBeVisible();

    await page.goto('/movimientos');
    await expect(page.getByTestId('pending-drafts-banner')).toHaveText(
      /1 borrador pendiente de revisar/,
    );
    await expect(page.getByTestId('drafts-badge').filter({ visible: true })).toContainText('1');
    await page.getByTestId('pending-drafts-banner').click();
    await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
    await page.getByTestId('draft-row').first().click();
    await page.getByRole('button', { name: 'Descartar' }).click();

    await expect(page).toHaveURL(/\/pendientes$/);
    await expect(page.getByText('No hay borradores pendientes')).toBeVisible();
    expect(stub.discardedDraftIds).toHaveLength(1);
    expect(stub.confirmedDraftIds).toHaveLength(0);
    await expect(page.getByTestId('drafts-badge')).toHaveCount(0);
  });

  test('a failed analysis still opens a usable draft with the transcript', async ({ page }) => {
    await fakeMicrophone(page);
    const reference = await referenceData(page);
    await stubCaptureApi(page, reference, { failed: true });

    await page.goto('/movimientos');
    await plusButton(page).click();
    const sheet = quickAdd(page);
    await sheet.getByRole('button', { name: 'Voz' }).click();
    await sheet.getByRole('button', { name: 'Enviar audio' }).click();

    await expect(page).toHaveURL(/\/pendientes\/\d+$/);
    await expect(page.getByTestId('capture-failed')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Descripción' })).toHaveValue(TRANSCRIPT);
    await expect(
      page.locator('app-review-field[data-field="amount_cents"]').getByText('Revisa este dato'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(page).toHaveURL(/\/pendientes$/);
  });
});

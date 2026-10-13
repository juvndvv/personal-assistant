import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  aDraft,
  aDraftPage,
  anAttachment,
  aCapture,
} from '../../features/drafts/testing/draft-fixtures';
import { AttachmentsApi } from './attachments.api';
import { CapturesApi } from './captures.api';
import { DraftsApi, draftListParams } from './drafts.api';

describe('M3 API clients', () => {
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('uploads a capture as multipart with kind, named file and client_started_at', async () => {
    const api = TestBed.inject(CapturesApi);
    const audio = new Blob(['bytes'], { type: 'audio/mp4' });
    const result = firstValueFrom(
      api.create({
        kind: 'voice',
        file: audio,
        filename: 'voz.m4a',
        clientStartedAt: '2026-10-13T08:15:00.000Z',
      }),
    );

    const request = backend.expectOne({ method: 'POST', url: '/api/v1/captures' });
    const body = request.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('kind')).toBe('voice');
    expect((body.get('file') as File).name).toBe('voz.m4a');
    expect((body.get('file') as File).type).toBe('audio/mp4');
    expect(body.get('client_started_at')).toBe('2026-10-13T08:15:00.000Z');
    const payload = { capture: aCapture(), draft: aDraft() };
    request.flush({ data: payload }, { status: 201, statusText: 'Created' });

    expect(await result).toEqual(payload);
  });

  it('serializes draft filters and calls every draft endpoint', async () => {
    expect(
      draftListParams({ status: 'pending', origin: ['voice', 'photo'], per_page: 1 }).toString(),
    ).toBe('status=pending&origin%5B%5D=voice&origin%5B%5D=photo&per_page=1');

    const api = TestBed.inject(DraftsApi);
    const list = firstValueFrom(api.list({ status: 'pending', per_page: 1 }));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/drafts?status=pending&per_page=1' })
      .flush(aDraftPage([aDraft()], 3));
    expect((await list).meta.total).toBe(3);

    const one = firstValueFrom(api.get(88));
    backend.expectOne({ method: 'GET', url: '/api/v1/drafts/88' }).flush({ data: aDraft() });
    expect((await one).id).toBe(88);

    const discarded = firstValueFrom(api.discard(88));
    backend
      .expectOne({ method: 'POST', url: '/api/v1/drafts/88/discard' })
      .flush({ data: aDraft({ status: 'discarded' }) });
    expect((await discarded).status).toBe('discarded');
  });

  it('lists, adds and deletes receipts', async () => {
    const api = TestBed.inject(AttachmentsApi);
    const list = firstValueFrom(api.listForTransaction(120));
    backend
      .expectOne({ method: 'GET', url: '/api/v1/transactions/120/attachments' })
      .flush({ data: [anAttachment()] });
    expect(await list).toHaveLength(1);

    const added = firstValueFrom(
      api.addToTransaction(120, new Blob(['x'], { type: 'image/jpeg' }), 'ticket.jpg'),
    );
    const upload = backend.expectOne({
      method: 'POST',
      url: '/api/v1/transactions/120/attachments',
    });
    expect(((upload.request.body as FormData).get('file') as File).name).toBe('ticket.jpg');
    upload.flush({ data: anAttachment() }, { status: 201, statusText: 'Created' });
    expect((await added).kind).toBe('image');

    const removed = firstValueFrom(api.delete('01JATTACHMENT0000000000001'), {
      defaultValue: undefined,
    });
    backend
      .expectOne({ method: 'DELETE', url: '/api/v1/attachments/01JATTACHMENT0000000000001' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await removed;
  });
});

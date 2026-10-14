import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CapturesApi } from '../../../core/api/captures.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import { DraftsApi } from '../../../core/api/drafts.api';
import { CaptureResult, CaptureUpload, Category, QuickAddDefaults } from '../../../core/api/models';
import { QuickAddApi } from '../../../core/api/quick-add.api';
import { TagsApi } from '../../../core/api/tags.api';
import { TransactionsApi } from '../../../core/api/transactions.api';
import { AuthStore } from '../../../core/auth/auth.store';
import { ImageCompressor } from '../../../core/capture/image-compressor';
import { AppUpdates } from '../../../core/pwa/app-updates';
import { UiToast } from '../../../shared/ui';
import { anAccount } from '../../accounts/testing/account-fixtures';
import { CAPTURE_CLIENT_TIMEOUT_MS, CAPTURE_MESSAGES } from '../../drafts/capture-flow';
import { PendingDrafts } from '../../drafts/pending-drafts';
import { aCapture, aDraft, aDraftPage } from '../../drafts/testing/draft-fixtures';
import { ShellLayout } from '../../shell/shell.layout';
import { aTransaction } from '../testing/transaction-fixtures';

class FakeMediaRecorder {
  static supported = ['audio/mp4'];
  static isTypeSupported(mime: string): boolean {
    return FakeMediaRecorder.supported.includes(mime);
  }
  state: 'inactive' | 'recording' = 'inactive';
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? '';
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const DEFAULTS: QuickAddDefaults = {
  date: '2026-10-13',
  account_id: 3,
  frequent_category_ids: { expense: [20], income: [] },
};

const TRANSPORT: Category = {
  id: 20,
  kind: 'expense',
  name: 'Transporte',
  parent_id: null,
  icon: null,
  color: null,
  sort_order: 0,
  archived_at: null,
  children: [],
};

const RESULT: CaptureResult = { capture: aCapture(), draft: aDraft({ id: 88 }) };

function installMicrophone(getUserMedia: () => Promise<MediaStream>): void {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
}

const stopTrack = vi.fn();
const STREAM = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;

async function setup() {
  const capturesApi = {
    create: vi.fn<(upload: CaptureUpload) => Observable<CaptureResult>>(() => of(RESULT)),
  };
  const draftsApi = { list: vi.fn(() => of(aDraftPage([], 1))), get: vi.fn(), discard: vi.fn() };
  const transactionsApi = {
    create: vi.fn(() => of(aTransaction({ id: 501 }))),
    delete: vi.fn(),
    list: vi.fn(),
  };
  const compressor = {
    compress: vi.fn(async () => ({
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      filename: 'IMG_1.jpg',
    })),
  };
  const view = await render(ShellLayout, {
    providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { user: signal(null), logout: vi.fn() } },
      {
        provide: AppUpdates,
        useValue: { updateReady: signal(false), reloadRequired: signal(false), reload: vi.fn() },
      },
      { provide: QuickAddApi, useValue: { defaults: vi.fn(() => of(DEFAULTS)) } },
      { provide: AccountsApi, useValue: { list: vi.fn(() => of([anAccount({ id: 3 })])) } },
      { provide: CategoriesApi, useValue: { list: vi.fn(() => of([TRANSPORT])) } },
      { provide: TagsApi, useValue: { list: vi.fn(() => of([])) } },
      { provide: TransactionsApi, useValue: transactionsApi },
      { provide: CapturesApi, useValue: capturesApi },
      { provide: DraftsApi, useValue: draftsApi },
      { provide: ImageCompressor, useValue: compressor },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
  });
  const injector = view.fixture.debugElement.injector;
  const router = injector.get(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const user = userEvent.setup();
  const plus = screen.getAllByRole('button', { name: 'Añadir movimiento' });
  await user.click(plus[plus.length - 1] as HTMLElement);
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo movimiento' });
  return {
    capturesApi,
    draftsApi,
    transactionsApi,
    compressor,
    navigate,
    user,
    dialog,
    pending: injector.get(PendingDrafts),
  };
}

function uploadTicket(dialog: HTMLElement): void {
  fireEvent.change(within(dialog).getByLabelText('Foto del ticket'), {
    target: { files: [new File(['raw'], 'ticket.jpg', { type: 'image/jpeg' })] },
  });
}

function voiceButton(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole('button', { name: 'Voz' });
}

describe('Quick add capture', () => {
  beforeEach(() => {
    stopTrack.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('offers Voz and Foto next to the amount while the manual form stays the default', async () => {
    const { dialog } = await setup();

    const amount = within(dialog).getByRole('textbox', { name: /importe/i });
    await vi.waitFor(() => expect(amount).toHaveFocus());
    expect(voiceButton(dialog)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Foto' })).toBeVisible();
    expect(within(dialog).getByLabelText('Foto del ticket')).toHaveAttribute(
      'capture',
      'environment',
    );
    expect(within(dialog).getByLabelText('Foto del ticket')).toHaveAttribute('accept', 'image/*');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeVisible();
  });

  it('tap-to-toggle records, uploads the voice note as .m4a and opens the draft review', async () => {
    installMicrophone(async () => STREAM);
    const { dialog, capturesApi, navigate, user } = await setup();

    fireEvent.pointerDown(voiceButton(dialog));
    fireEvent.pointerUp(voiceButton(dialog));
    expect(await within(dialog).findByTestId('voice-recording')).toHaveTextContent('/ 1:00');
    expect(within(dialog).getByRole('meter', { name: 'Nivel del micrófono' })).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Enviar audio' }));

    await vi.waitFor(() => expect(capturesApi.create).toHaveBeenCalledTimes(1));
    const upload = capturesApi.create.mock.calls[0]?.[0] as CaptureUpload;
    expect(upload.kind).toBe('voice');
    expect(upload.filename).toBe('voz.m4a');
    expect(upload.file.type).toBe('audio/mp4');
    expect(upload.clientStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/pendientes', 88]));
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).not.toBeInTheDocument(),
    );
  });

  it('hold-to-talk sends the recording on release', async () => {
    installMicrophone(async () => STREAM);
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const { dialog, capturesApi } = await setup();

    fireEvent.pointerDown(voiceButton(dialog));
    await within(dialog).findByTestId('voice-recording');
    now += 2_500;
    fireEvent.pointerUp(voiceButton(dialog));

    await vi.waitFor(() => expect(capturesApi.create).toHaveBeenCalledTimes(1));
    expect(capturesApi.create.mock.calls[0]?.[0].kind).toBe('voice');
  });

  it('shows the processing state with a cancel button that returns to the manual form', async () => {
    installMicrophone(async () => STREAM);
    const pending = new Subject<CaptureResult>();
    const { dialog, capturesApi, navigate, user } = await setup();
    capturesApi.create.mockReturnValueOnce(pending);

    fireEvent.pointerDown(voiceButton(dialog));
    fireEvent.pointerUp(voiceButton(dialog));
    await user.click(await within(dialog).findByRole('button', { name: 'Enviar audio' }));

    const processing = await within(dialog).findByTestId('capture-processing');
    expect(processing).toHaveTextContent('Analizando la nota de voz…');
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();

    await user.click(within(processing).getByRole('button', { name: 'Cancelar' }));

    expect(within(dialog).queryByTestId('capture-processing')).not.toBeInTheDocument();
    expect(pending.observed).toBe(false);
    expect(within(dialog).getByRole('textbox', { name: /importe/i })).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps manual entry working when the capture upload fails', async () => {
    const { dialog, capturesApi, transactionsApi, compressor, navigate, user } = await setup();
    capturesApi.create.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'boom' } })),
    );

    await user.upload(
      within(dialog).getByLabelText('Foto del ticket'),
      new File(['raw'], 'IMG_1.HEIC', { type: 'image/heic' }),
    );

    expect(await within(dialog).findByTestId('capture-failure')).toHaveTextContent(
      CAPTURE_MESSAGES.generic,
    );
    expect(compressor.compress).toHaveBeenCalled();
    expect(capturesApi.create.mock.calls[0]?.[0]).toMatchObject({
      kind: 'photo',
      filename: 'IMG_1.jpg',
    });
    expect(navigate).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: /importe/i }), '4');
    await user.click(await within(dialog).findByRole('button', { name: 'Transporte' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(transactionsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount_cents: 400, category_id: 20 }),
    );
    expect(transactionsApi.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ draft_id: expect.anything() }),
    );
  });

  it('gives up after the client timeout and hands control back to the manual form', async () => {
    const neverAnswers = new Subject<CaptureResult>();
    const { dialog, capturesApi, navigate } = await setup();
    capturesApi.create.mockReturnValueOnce(neverAnswers);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

    uploadTicket(dialog);
    await vi.advanceTimersByTimeAsync(0);
    expect(capturesApi.create).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByTestId('capture-processing')).toBeVisible();

    await vi.advanceTimersByTimeAsync(CAPTURE_CLIENT_TIMEOUT_MS - 1);
    expect(within(dialog).getByTestId('capture-processing')).toBeVisible();

    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();

    expect(await within(dialog).findByTestId('capture-failure')).toHaveTextContent(
      CAPTURE_MESSAGES.timeout,
    );
    expect(within(dialog).queryByTestId('capture-processing')).not.toBeInTheDocument();
    expect(neverAnswers.observed).toBe(false);
    const amount = within(dialog).getByRole('textbox', { name: /importe/i });
    expect(amount).toBeEnabled();
    fireEvent.input(amount, { target: { value: '4' } });
    expect(amount).toHaveValue('4');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('explains the hourly capture limit when the server throttles the upload', async () => {
    const { dialog, capturesApi, navigate } = await setup();
    capturesApi.create.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 429, error: { message: 'Too Many' } })),
    );

    uploadTicket(dialog);

    expect(await within(dialog).findByTestId('capture-failure')).toHaveTextContent(
      CAPTURE_MESSAGES.throttled,
    );
    expect(within(dialog).getByRole('textbox', { name: /importe/i })).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the server validation message when the file is rejected', async () => {
    const { dialog, capturesApi, navigate } = await setup();
    capturesApi.create.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: {
              message: 'El formato del archivo no es válido.',
              errors: { file: ['El formato del archivo no es válido.'] },
            },
          }),
      ),
    );

    uploadTicket(dialog);

    expect(await within(dialog).findByTestId('capture-failure')).toHaveTextContent(
      'El formato del archivo no es válido.',
    );
    expect(within(dialog).getByRole('textbox', { name: /importe/i })).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('discards an in-progress recording when the sheet is closed', async () => {
    installMicrophone(async () => STREAM);
    const { dialog, capturesApi, user } = await setup();

    fireEvent.pointerDown(voiceButton(dialog));
    fireEvent.pointerUp(voiceButton(dialog));
    await within(dialog).findByTestId('voice-recording');
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));

    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Nuevo movimiento' })).not.toBeInTheDocument(),
    );
    expect(capturesApi.create).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it('explains when the microphone permission is denied', async () => {
    installMicrophone(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const { dialog } = await setup();

    fireEvent.pointerDown(voiceButton(dialog));
    fireEvent.pointerUp(voiceButton(dialog));

    expect(await within(dialog).findByTestId('capture-problem')).toHaveTextContent(
      'No hay acceso al micrófono',
    );
    expect(within(dialog).getByRole('textbox', { name: /importe/i })).toBeVisible();
  });

  it('refreshes the pending badge after a successful capture', async () => {
    const { dialog, draftsApi, pending, user } = await setup();
    draftsApi.list.mockClear();

    await user.upload(
      within(dialog).getByLabelText('Foto del ticket'),
      new File(['raw'], 'ticket.jpg', { type: 'image/jpeg' }),
    );

    await vi.waitFor(() => expect(draftsApi.list).toHaveBeenCalled());
    await vi.waitFor(() => expect(pending.count()).toBe(1));
    expect(pending.recall(88)?.id).toBe(88);
  });
});

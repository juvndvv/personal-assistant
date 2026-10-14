import { HttpErrorResponse } from '@angular/common/http';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { AttachmentsApi } from '../../../core/api/attachments.api';
import { ImageCompressor } from '../../../core/capture/image-compressor';
import { UiToast } from '../../../shared/ui';
import { anAttachment } from '../../drafts/testing/draft-fixtures';
import { MovementSheets } from '../movement-sheets';
import { ReceiptsGallery } from './receipts-gallery';

const PHOTO = anAttachment();
const AUDIO = anAttachment({
  id: '01JAUDIO0000000000000000001',
  kind: 'audio',
  mime: 'audio/mp4',
  original_name: 'voz.m4a',
  url: '/api/v1/attachments/01JAUDIO0000000000000000001',
  download_url: '/api/v1/attachments/01JAUDIO0000000000000000001?download=1',
});

async function setup() {
  const api = {
    listForTransaction: vi.fn(() => of([PHOTO, AUDIO])),
    addToTransaction: vi.fn(() => of(anAttachment({ id: 'NEW', original_name: 'nuevo.jpg' }))),
    delete: vi.fn(() => of(undefined)),
  };
  const compressor = {
    compress: vi.fn(async () => ({
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      filename: 'nuevo.jpg',
    })),
  };
  const view = await render(ReceiptsGallery, {
    providers: [
      { provide: AttachmentsApi, useValue: api },
      { provide: ImageCompressor, useValue: compressor },
      { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    inputs: { transactionId: 120 },
  });
  const sheets = view.fixture.debugElement.injector.get(MovementSheets);
  return { api, compressor, sheets, user: userEvent.setup() };
}

describe('ReceiptsGallery', () => {
  it('offers a retry when the receipts fail to load', async () => {
    const api = {
      listForTransaction: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('offline')))
        .mockReturnValue(of([PHOTO])),
      addToTransaction: vi.fn(),
      delete: vi.fn(),
    };
    await render(ReceiptsGallery, {
      providers: [
        { provide: AttachmentsApi, useValue: api },
        { provide: ImageCompressor, useValue: { compress: vi.fn() } },
        { provide: UiToast, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
      inputs: { transactionId: 120 },
    });
    const user = userEvent.setup();

    const alert = await screen.findByTestId('receipts-load-failure');
    expect(alert).toHaveTextContent('No se pudieron cargar los justificantes.');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByTestId('receipt')).toHaveLength(1);
    expect(screen.queryByTestId('receipts-load-failure')).not.toBeInTheDocument();
    expect(api.listForTransaction).toHaveBeenCalledTimes(2);
  });

  it('lists receipts with an image preview, an audio player and download links', async () => {
    const { api } = await setup();

    const receipts = await screen.findAllByTestId('receipt');
    expect(api.listForTransaction).toHaveBeenCalledWith(120);
    expect(receipts).toHaveLength(2);
    expect(within(receipts[0] as HTMLElement).getByRole('img')).toHaveAttribute('src', PHOTO.url);
    expect(receipts[1]?.querySelector('audio')).toHaveAttribute('src', AUDIO.url);
    const downloads = screen.getAllByRole('link', { name: 'Descargar' });
    expect(downloads[0]).toHaveAttribute('href', PHOTO.download_url);
    expect(downloads[1]).toHaveAttribute('href', AUDIO.download_url);
  });

  it('adds a compressed photo as a receipt', async () => {
    const { api, compressor, sheets, user } = await setup();
    await screen.findAllByTestId('receipt');

    await user.upload(
      screen.getByLabelText('Archivo del justificante'),
      new File(['raw'], 'IMG.HEIC', { type: 'image/heic' }),
    );

    expect(compressor.compress).toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(api.addToTransaction).toHaveBeenCalledWith(120, expect.any(Blob), 'nuevo.jpg'),
    );
    expect(await screen.findAllByTestId('receipt')).toHaveLength(3);
    expect(sheets.changes()).toBe(1);
  });

  it('uploads audio receipts as they are', async () => {
    const { api, compressor, user } = await setup();
    await screen.findAllByTestId('receipt');
    const audio = new File(['a'], 'nota.m4a', { type: 'audio/mp4' });

    await user.upload(screen.getByLabelText('Archivo del justificante'), audio);

    await vi.waitFor(() =>
      expect(api.addToTransaction).toHaveBeenCalledWith(120, audio, 'nota.m4a'),
    );
    expect(compressor.compress).not.toHaveBeenCalled();
  });

  it('deletes a receipt', async () => {
    const { api, user } = await setup();
    await screen.findAllByTestId('receipt');

    await user.click(
      screen.getAllByRole('button', { name: 'Eliminar justificante' })[0] as HTMLElement,
    );

    expect(api.delete).toHaveBeenCalledWith(PHOTO.id);
    expect(await screen.findAllByTestId('receipt')).toHaveLength(1);
  });

  it('explains when a receipt still belongs to a pending draft', async () => {
    const { api, user } = await setup();
    api.delete.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: 'x', code: 'attachment_not_deletable' },
          }),
      ),
    );
    await screen.findAllByTestId('receipt');

    await user.click(
      screen.getAllByRole('button', { name: 'Eliminar justificante' })[0] as HTMLElement,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Descarta el borrador');
    expect(screen.getAllByTestId('receipt')).toHaveLength(2);
  });
});

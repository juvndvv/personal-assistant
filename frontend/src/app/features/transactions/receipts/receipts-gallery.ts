import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucidePaperclip, lucideTrash2 } from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { conflictCode, serverMessage, validationErrors } from '../../../core/api/api-error';
import { AttachmentsApi } from '../../../core/api/attachments.api';
import { Attachment } from '../../../core/api/models';
import { UiAlert, UiButton, UiCard, UiSkeleton, UiToast } from '../../../shared/ui';
import { MovementSheets } from '../movement-sheets';
import { ReceiptUpload } from './receipt-upload';

@Component({
  selector: 'app-receipts-gallery',
  imports: [NgIcon, UiAlert, UiButton, UiCard, UiSkeleton],
  providers: [provideIcons({ lucideDownload, lucidePaperclip, lucideTrash2 })],
  template: `
    <section class="flex flex-col gap-3" aria-labelledby="receipts-heading">
      <h3 id="receipts-heading" class="text-sm font-medium text-foreground">Justificantes</h3>
      @if (loadFailure(); as message) {
        <ui-alert
          retryable
          [retrying]="loading()"
          (retry)="load(transactionId())"
          data-testid="receipts-load-failure"
          >{{ message }}</ui-alert
        >
      }
      @if (failure(); as message) {
        <ui-alert>{{ message }}</ui-alert>
      }
      @if (loading()) {
        <div role="status" aria-live="polite">
          <span class="sr-only">Cargando justificantes</span>
          <ui-skeleton shape="block" height="5rem" />
        </div>
      } @else if (receipts().length === 0) {
        <p class="text-sm text-muted-foreground">Este movimiento no tiene justificantes.</p>
      }
      <ul class="flex flex-col gap-3" data-testid="receipts">
        @for (receipt of receipts(); track receipt.id) {
          <li uiCard padding="sm" class="flex flex-col gap-2" data-testid="receipt">
            @if (receipt.kind === 'image') {
              <a [href]="receipt.url" target="_blank" rel="noopener">
                <img
                  [src]="receipt.url"
                  [alt]="'Justificante ' + (receipt.original_name ?? '')"
                  class="max-h-56 w-full rounded-sm bg-muted object-contain"
                  loading="lazy"
                />
              </a>
            } @else {
              <audio controls preload="none" class="w-full" [src]="receipt.url">
                <track kind="captions" />
              </audio>
            }
            <div class="flex items-center gap-2 text-sm">
              <span class="min-w-0 flex-1 truncate text-muted-foreground">
                {{ receipt.original_name ?? (receipt.kind === 'image' ? 'Foto' : 'Audio') }}
              </span>
              <a
                [href]="receipt.download_url"
                [attr.download]="receipt.original_name ?? ''"
                class="inline-flex min-h-11 items-center gap-1 rounded-capsule px-3 font-medium text-link transition-colors duration-150 hover:bg-hover"
              >
                <ng-icon name="lucideDownload" size="16" aria-hidden="true" />
                Descargar
              </a>
              <button
                type="button"
                class="inline-flex size-11 items-center justify-center rounded-capsule text-danger-text transition-colors duration-150 hover:bg-hover disabled:opacity-50"
                aria-label="Eliminar justificante"
                [disabled]="busy()"
                (click)="remove(receipt)"
              >
                <ng-icon name="lucideTrash2" size="16" aria-hidden="true" />
              </button>
            </div>
          </li>
        }
      </ul>
      <input
        #picker
        type="file"
        accept="image/*,audio/*"
        class="sr-only"
        tabindex="-1"
        aria-label="Archivo del justificante"
        data-testid="receipt-input"
        (change)="onFileSelected($event)"
      />
      <ui-button variant="outline" [loading]="uploading()" (clicked)="pick()">
        <ng-icon name="lucidePaperclip" aria-hidden="true" />
        Añadir justificante
      </ui-button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptsGallery {
  private readonly api = inject(AttachmentsApi);
  private readonly upload = inject(ReceiptUpload);
  private readonly sheets = inject(MovementSheets);
  private readonly toast = inject(UiToast);
  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  readonly transactionId = input<number | null>(null);

  protected readonly receipts = signal<Attachment[]>([]);
  protected readonly loading = signal(false);
  protected readonly uploading = signal(false);
  protected readonly deleting = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly loadFailure = signal<string | null>(null);
  protected readonly busy = computed(() => this.uploading() || this.deleting());

  constructor() {
    effect(() => {
      const id = this.transactionId();
      untracked(() => void this.load(id));
    });
  }

  protected pick(): void {
    this.picker().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const element = event.target as HTMLInputElement;
    const file = element.files?.[0];
    element.value = '';
    const transactionId = this.transactionId();
    if (file === undefined || transactionId === null) {
      return;
    }
    this.failure.set(null);
    this.uploading.set(true);
    try {
      const prepared = await this.upload.prepare(file);
      const created = await firstValueFrom(
        this.api.addToTransaction(transactionId, prepared.blob, prepared.filename),
      );
      this.receipts.update((list) => [...list, created]);
      this.sheets.notifyChanged();
      this.toast.success('Justificante añadido');
    } catch (error: unknown) {
      const fields = validationErrors(error);
      this.failure.set(
        fields?.['file'] ?? serverMessage(error) ?? 'No se pudo añadir el justificante.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  protected async remove(receipt: Attachment): Promise<void> {
    this.failure.set(null);
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.delete(receipt.id), { defaultValue: undefined });
      this.receipts.update((list) => list.filter((item) => item.id !== receipt.id));
      this.sheets.notifyChanged();
      this.toast.success('Justificante eliminado');
    } catch (error: unknown) {
      this.failure.set(
        conflictCode(error) === 'attachment_not_deletable'
          ? 'Este archivo pertenece a un borrador pendiente. Descarta el borrador para eliminarlo.'
          : (serverMessage(error) ?? 'No se pudo eliminar el justificante.'),
      );
    } finally {
      this.deleting.set(false);
    }
  }

  protected async load(transactionId: number | null): Promise<void> {
    this.receipts.set([]);
    this.failure.set(null);
    this.loadFailure.set(null);
    if (transactionId === null) {
      return;
    }
    this.loading.set(true);
    try {
      const receipts = await firstValueFrom(this.api.listForTransaction(transactionId));
      if (this.transactionId() === transactionId) {
        this.receipts.set(receipts);
      }
    } catch (error: unknown) {
      this.loadFailure.set(serverMessage(error) ?? 'No se pudieron cargar los justificantes.');
    } finally {
      this.loading.set(false);
    }
  }
}

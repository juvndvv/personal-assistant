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
import { UiButton, UiToast } from '../../../shared/ui';
import { MovementSheets } from '../movement-sheets';
import { ReceiptUpload } from './receipt-upload';

@Component({
  selector: 'app-receipts-gallery',
  imports: [NgIcon, UiButton],
  providers: [provideIcons({ lucideDownload, lucidePaperclip, lucideTrash2 })],
  template: `
    <section class="flex flex-col gap-3" aria-labelledby="receipts-heading">
      <h3 id="receipts-heading" class="text-sm font-medium text-foreground">Justificantes</h3>
      @if (failure(); as message) {
        <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ message }}
        </p>
      }
      @if (loading()) {
        <p class="text-sm text-muted-foreground">Cargando justificantes…</p>
      } @else if (receipts().length === 0) {
        <p class="text-sm text-muted-foreground">Este movimiento no tiene justificantes.</p>
      }
      <ul class="flex flex-col gap-3" data-testid="receipts">
        @for (receipt of receipts(); track receipt.id) {
          <li class="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="receipt">
            @if (receipt.kind === 'image') {
              <a [href]="receipt.url" target="_blank" rel="noopener">
                <img
                  [src]="receipt.url"
                  [alt]="'Justificante ' + (receipt.original_name ?? '')"
                  class="max-h-56 w-full rounded-lg bg-muted object-contain"
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
                class="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-primary-text hover:bg-muted"
              >
                <ng-icon name="lucideDownload" size="16" aria-hidden="true" />
                Descargar
              </a>
              <button
                type="button"
                class="inline-flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-muted"
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

  private async load(transactionId: number | null): Promise<void> {
    this.receipts.set([]);
    this.failure.set(null);
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
      this.failure.set(serverMessage(error) ?? 'No se pudieron cargar los justificantes.');
    } finally {
      this.loading.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideFileArchive, lucideFileSpreadsheet } from '@ng-icons/lucide';
import { CsvDelimiter, fullArchiveUrl, transactionsCsvUrl } from '../../core/api/exports.api';
import { PageHeader } from '../../shared/layout/page-header';
import { UiCheckbox, UiSegmented } from '../../shared/ui';
import { DOWNLOAD_LINK_CLASS, PRIMARY_DOWNLOAD_LINK_CLASS } from './download-link-class';

const DELIMITER_OPTIONS = [
  { value: 'semicolon', label: 'Punto y coma (Excel)' },
  { value: 'comma', label: 'Coma' },
];

@Component({
  selector: 'app-export-page',
  imports: [NgIcon, PageHeader, UiCheckbox, UiSegmented],
  providers: [provideIcons({ lucideDownload, lucideFileArchive, lucideFileSpreadsheet })],
  template: `
    <app-page-header
      title="Exportar datos"
      subtitle="Tus datos son tuyos: descárgalos cuando quieras en CSV."
    />
    <div class="flex flex-col gap-4">
      <section
        class="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4"
        aria-labelledby="export-full-title"
      >
        <div class="flex items-start gap-3">
          <ng-icon
            name="lucideFileArchive"
            size="24"
            class="text-primary-text"
            aria-hidden="true"
          />
          <div>
            <h2 id="export-full-title" class="font-semibold text-foreground">
              Exportación completa
            </h2>
            <p class="text-sm text-muted-foreground">
              Un ZIP con cuentas, categorías, movimientos, transferencias, etiquetas, fijos,
              presupuestos, índice de justificantes y ajustes.
            </p>
          </div>
        </div>
        <ui-checkbox name="include_receipts" [(checked)]="includeReceipts">
          Incluir justificantes (fotos y audios)
        </ui-checkbox>
        <a
          [href]="archiveUrl()"
          download
          [class]="primaryLinkClass"
          data-testid="export-full-archive"
        >
          <ng-icon name="lucideDownload" size="18" aria-hidden="true" />
          Descargar exportación completa (ZIP)
        </a>
      </section>

      <section
        class="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4"
        aria-labelledby="export-csv-title"
      >
        <div class="flex items-start gap-3">
          <ng-icon
            name="lucideFileSpreadsheet"
            size="24"
            class="text-primary-text"
            aria-hidden="true"
          />
          <div>
            <h2 id="export-csv-title" class="font-semibold text-foreground">
              Todos los movimientos en CSV
            </h2>
            <p class="text-sm text-muted-foreground">
              Para exportar solo una parte, filtra la lista de Movimientos y pulsa «Exportar CSV».
            </p>
          </div>
        </div>
        <ui-segmented
          ariaLabel="Separador de columnas"
          [options]="delimiterOptions"
          [value]="delimiter()"
          (valueChange)="delimiter.set($event === 'comma' ? 'comma' : 'semicolon')"
        />
        <a [href]="csvUrl()" download [class]="linkClass" data-testid="export-all-csv">
          <ng-icon name="lucideDownload" size="18" aria-hidden="true" />
          Descargar movimientos (CSV)
        </a>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPage {
  protected readonly delimiterOptions = DELIMITER_OPTIONS;
  protected readonly linkClass = DOWNLOAD_LINK_CLASS;
  protected readonly primaryLinkClass = PRIMARY_DOWNLOAD_LINK_CLASS;
  protected readonly includeReceipts = signal(false);
  protected readonly delimiter = signal<CsvDelimiter>('semicolon');

  protected readonly archiveUrl = computed(() => fullArchiveUrl(this.includeReceipts()));
  protected readonly csvUrl = computed(() => transactionsCsvUrl({}, this.delimiter()));
}

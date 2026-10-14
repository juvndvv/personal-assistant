import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideFileArchive, lucideFileSpreadsheet } from '@ng-icons/lucide';
import { CsvDelimiter, fullArchiveUrl, transactionsCsvUrl } from '../../core/api/exports.api';
import { PageHeader } from '../../shared/layout/page-header';
import { UiButtonLink, UiCard, UiCheckbox, UiSegmented } from '../../shared/ui';

const DELIMITER_OPTIONS = [
  { value: 'semicolon', label: 'Punto y coma' },
  { value: 'comma', label: 'Coma' },
];

@Component({
  selector: 'app-export-page',
  imports: [NgIcon, PageHeader, UiButtonLink, UiCard, UiCheckbox, UiSegmented],
  providers: [provideIcons({ lucideDownload, lucideFileArchive, lucideFileSpreadsheet })],
  template: `
    <app-page-header
      title="Exportar datos"
      subtitle="Tus datos son tuyos: descárgalos cuando quieras en CSV."
      backLink="/mas"
      backLabel="Más"
    />
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <section uiCard aria-labelledby="export-full-title">
        <div class="flex flex-col gap-4">
          <div class="flex items-start gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-on-card text-foreground"
              aria-hidden="true"
            >
              <ng-icon name="lucideFileArchive" size="20" />
            </span>
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
            uiButtonLink
            fullWidth
            data-testid="export-full-archive"
          >
            <ng-icon name="lucideDownload" size="18" aria-hidden="true" />
            Descargar exportación completa (ZIP)
          </a>
        </div>
      </section>

      <section uiCard aria-labelledby="export-csv-title">
        <div class="flex flex-col gap-4">
          <div class="flex items-start gap-3">
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-fill-on-card text-foreground"
              aria-hidden="true"
            >
              <ng-icon name="lucideFileSpreadsheet" size="20" />
            </span>
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
          <p class="-mt-2 text-sm text-muted-foreground" data-testid="delimiter-hint">
            Punto y coma es el que abre bien en Excel; coma, para el resto de hojas de cálculo.
          </p>
          <a [href]="csvUrl()" download uiButtonLink variant="outline" data-testid="export-all-csv">
            <ng-icon name="lucideDownload" size="18" aria-hidden="true" />
            Descargar movimientos (CSV)
          </a>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportPage {
  protected readonly delimiterOptions = DELIMITER_OPTIONS;
  protected readonly includeReceipts = signal(false);
  protected readonly delimiter = signal<CsvDelimiter>('semicolon');

  protected readonly archiveUrl = computed(() => fullArchiveUrl(this.includeReceipts()));
  protected readonly csvUrl = computed(() => transactionsCsvUrl({}, this.delimiter()));
}

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  YuwButtonComponent,
  YuwComboboxComponent,
  YuwComboboxOptionDto,
  YuwDialogImports,
  YuwInputComponent,
  YuwSheetImports,
  YuwTabPanelDirective,
  YuwTabItemDto,
  YuwTableImports,
  YuwTabsComponent,
  YuwToasterComponent,
  yuwToast,
} from 'yukit-web';
import { EurPipe } from '../../core/money/eur.pipe';
import {
  UiBadge,
  UiButton,
  UiDateInput,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiInput,
  UiMoneyInput,
  UiSelect,
  UiSelectOption,
  UiSheet,
  UiSheetFooter,
  UiToast,
} from '../../shared/ui';

interface SampleRow {
  date: string;
  concept: string;
  amountCents: number;
}

@Component({
  selector: 'app-kitchen-sink-page',
  imports: [
    EurPipe,
    YuwButtonComponent,
    YuwComboboxComponent,
    YuwDialogImports,
    YuwInputComponent,
    YuwSheetImports,
    YuwTabPanelDirective,
    YuwTableImports,
    YuwTabsComponent,
    YuwToasterComponent,
    UiBadge,
    UiButton,
    UiDateInput,
    UiDialog,
    UiDialogFooter,
    UiEmptyState,
    UiInput,
    UiMoneyInput,
    UiSelect,
    UiSheet,
    UiSheetFooter,
  ],
  host: { class: 'block p-6' },
  template: `
    <h1 class="text-2xl font-semibold">Kitchen sink</h1>
    <p class="text-sm text-muted-foreground">yukit-web en Angular 22 y wrappers propios.</p>

    <section class="mt-6 flex flex-col gap-4" data-testid="yukit">
      <h2 class="text-lg font-semibold">yukit-web</h2>
      <div class="flex flex-wrap gap-2">
        <yuw-button color="primary" (clicked)="toastFromLibrary()">Botón primario</yuw-button>
        <yuw-button variant="outline">Botón secundario</yuw-button>
      </div>
      <yuw-input [(value)]="libraryText" placeholder="Texto libre" inputId="ks-yuw-input" />
      <yuw-combobox
        readonlyTrigger
        [options]="comboOptions"
        [(value)]="libraryChoice"
        placeholder="Elige una cuenta"
        searchPlaceholder="Buscar"
        triggerAriaLabel="Mostrar opciones"
      />
      <div class="flex flex-wrap gap-2">
        <yuw-dialog title="Diálogo" description="Diálogo de yukit-web" closeLabel="Cerrar">
          <ng-container yuwDialogTrigger>Abrir diálogo</ng-container>
          <p>Contenido del diálogo.</p>
        </yuw-dialog>
        <yuw-sheet side="bottom" title="Panel" closeLabel="Cerrar">
          <ng-container yuwSheetTrigger>Abrir panel</ng-container>
          <p>Contenido del panel.</p>
        </yuw-sheet>
      </div>
      <yuw-tabs [tabs]="tabs" [(activeTab)]="activeTab">
        <ng-template yuwTabPanel="gastos">Panel de gastos</ng-template>
        <ng-template yuwTabPanel="ingresos">Panel de ingresos</ng-template>
      </yuw-tabs>
      <div yuwTableContainer>
        <table yuwTable>
          <thead yuwTHead>
            <tr yuwTr>
              <th yuwTh>Fecha</th>
              <th yuwTh>Concepto</th>
              <th yuwTh class="text-right">Importe</th>
            </tr>
          </thead>
          <tbody yuwTBody>
            @for (row of rows; track row.concept) {
              <tr yuwTr>
                <td yuwTd>{{ row.date }}</td>
                <td yuwTd>{{ row.concept }}</td>
                <td yuwTd class="tabular-amount text-right">{{ row.amountCents | eur }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <yuw-toaster />
    </section>

    <section class="mt-10 flex max-w-md flex-col gap-4" data-testid="wrappers">
      <h2 class="text-lg font-semibold">shared/ui</h2>
      <div class="flex flex-wrap gap-2">
        <ui-button (clicked)="toastFromWrapper()">Guardar</ui-button>
        <ui-button variant="outline" (clicked)="dialogOpen.set(true)">Diálogo</ui-button>
        <ui-button variant="ghost" (clicked)="sheetOpen.set(true)">Panel</ui-button>
        <ui-button variant="danger" [loading]="true">Borrando</ui-button>
      </div>
      <div class="flex flex-wrap gap-2">
        <ui-badge>Neutro</ui-badge>
        <ui-badge tone="success">Confirmado</ui-badge>
        <ui-badge state="warning">Borrador</ui-badge>
        <ui-badge state="error">Error</ui-badge>
      </div>
      <ui-input label="Concepto" hint="Opcional" [(value)]="wrapperText" />
      <ui-money-input label="Importe" [(value)]="amountCents" />
      <p class="text-sm">Céntimos: {{ amountCents() ?? '—' }}</p>
      <ui-select
        label="Cuenta"
        placeholder="Elige una cuenta"
        [options]="selectOptions"
        [(value)]="wrapperChoice"
      />
      <ui-date-input label="Fecha" [(value)]="date" />
      <ui-empty-state title="Sin movimientos" description="Registra tu primer gasto." />

      <ui-dialog title="Confirmar" description="Diálogo propio" [(open)]="dialogOpen">
        <p>¿Seguro?</p>
        <div uiDialogFooter>
          <ui-button (clicked)="dialogOpen.set(false)">Aceptar</ui-button>
        </div>
      </ui-dialog>
      <ui-sheet title="Nuevo gasto" [(open)]="sheetOpen">
        <p>Formulario rápido.</p>
        <div uiSheetFooter>
          <ui-button [fullWidth]="true" (clicked)="sheetOpen.set(false)">Guardar</ui-button>
        </div>
      </ui-sheet>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenSinkPage {
  private readonly toast = new UiToast();

  protected readonly libraryText = signal('');
  protected readonly libraryChoice = signal<string | string[] | undefined>(undefined);
  protected readonly activeTab = signal('gastos');
  protected readonly wrapperText = signal('');
  protected readonly wrapperChoice = signal<string | null>(null);
  protected readonly amountCents = signal<number | null>(1250);
  protected readonly date = signal<string | null>('2026-10-13');
  protected readonly dialogOpen = signal(false);
  protected readonly sheetOpen = signal(false);

  protected readonly comboOptions: YuwComboboxOptionDto[] = [
    { value: '1', label: 'BBVA' },
    { value: '2', label: 'Efectivo' },
  ];
  protected readonly selectOptions: UiSelectOption[] = [
    { value: '1', label: 'BBVA' },
    { value: '2', label: 'Efectivo' },
  ];
  protected readonly tabs: YuwTabItemDto[] = [
    { id: 'gastos', label: 'Gastos' },
    { id: 'ingresos', label: 'Ingresos' },
  ];
  protected readonly rows: SampleRow[] = [
    { date: '13/10/2026', concept: 'Mercadona', amountCents: -4550 },
    { date: '12/10/2026', concept: 'Nómina', amountCents: 185000 },
  ];

  protected toastFromLibrary(): void {
    yuwToast.success('Toast de yukit-web');
  }

  protected toastFromWrapper(): void {
    this.toast.success('Guardado');
  }
}

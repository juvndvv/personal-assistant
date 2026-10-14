import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { ThemeService, isThemePreference } from '../../core/theme/theme.service';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../categories/category-appearance';
import { CategoryIcon } from '../categories/category-icon';
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiCard,
  UiDateInput,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiInput,
  UiMoneyInput,
  UiSelect,
  UiSelectOption,
  UiGlassBar,
  UiSegmentOption,
  UiSegmented,
  UiSheet,
  UiSheetFooter,
  UiSkeleton,
  UiSkeletonList,
  UiSwitch,
  UiTabItem,
  UiTabs,
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
    CategoryIcon,
    EurPipe,
    NgTemplateOutlet,
    UiAlert,
    UiCard,
    UiGlassBar,
    UiSegmented,
    UiSkeleton,
    UiSkeletonList,
    UiSwitch,
    UiTabs,
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

    <section class="mt-6 flex flex-col gap-4" data-testid="redesign">
      <h2 class="text-lg font-semibold">Sistema de diseño</h2>
      <div uiCard class="flex flex-col gap-4">
        <ui-segmented
          ariaLabel="Tema de la aplicación"
          [options]="themeOptions"
          [value]="theme.preference()"
          (valueChange)="onThemeChange($event)"
        />
        <ui-switch
          [checked]="theme.reducedTransparency()"
          (checkedChange)="theme.setReducedTransparency($event)"
          >Reducir transparencia</ui-switch
        >
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-card bg-background p-4 text-foreground" data-testid="showcase-light">
          <p class="mb-3 text-sm font-semibold text-muted-foreground">Tema actual</p>
          <ng-container [ngTemplateOutlet]="showcase" />
        </div>
        <div
          class="dark rounded-card bg-background p-4 text-foreground"
          data-testid="showcase-dark"
        >
          <p class="mb-3 text-sm font-semibold text-muted-foreground">Oscuro forzado</p>
          <ng-container [ngTemplateOutlet]="showcase" />
        </div>
      </div>
    </section>

    <ng-template #showcase>
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap gap-2">
          <ui-button>Principal</ui-button>
          <ui-button variant="secondary">Secundario</ui-button>
          <ui-button variant="outline">Contorno</ui-button>
          <ui-button variant="ghost">Fantasma</ui-button>
          <ui-button variant="danger">Borrar</ui-button>
        </div>
        <ui-card class="flex flex-col gap-1">
          <p class="text-sm text-muted-foreground">Saldo disponible</p>
          <p class="amount text-3xl text-foreground">{{ 245075 | eur }}</p>
          <p class="text-xs text-subtle-foreground">Actualizado hoy</p>
        </ui-card>
        <ul uiCard divided>
          @for (row of rows; track row.concept; let index = $index) {
            <li class="flex items-center gap-3 px-4 py-3">
              <app-category-icon [icon]="sampleIcons[index]" [color]="palette[index * 3].value" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ row.concept }}</span>
                <span class="block text-sm text-muted-foreground">{{ row.date }}</span>
              </span>
              <span
                class="amount text-[1.0625rem]"
                [class]="row.amountCents > 0 ? 'text-income' : 'text-expense'"
                >{{ row.amountCents > 0 ? '+' : '' }}{{ row.amountCents | eur }}</span
              >
            </li>
          }
        </ul>
        <ui-alert retryable title="No se pudieron cargar los movimientos">
          Revisa la conexión e inténtalo de nuevo.
        </ui-alert>
        <ui-alert tone="warning">Has gastado el 85 % del presupuesto de Ocio.</ui-alert>
        <ui-alert tone="success">Ajustes guardados.</ui-alert>
        <ui-card padding="none"><ui-skeleton-list label="Cargando ejemplo" [rows]="2" /></ui-card>
        <ui-skeleton [lines]="3" />
        <div class="flex flex-wrap gap-2">
          @for (colour of palette; track colour.key) {
            <app-category-icon size="sm" icon="tag" [color]="colour.value" />
          }
        </div>
        <ui-tabs ariaLabel="Ejemplo de pestañas" [tabs]="segmentTabs" [(active)]="segmentTab" />
        <div
          class="relative flex h-44 flex-col justify-end overflow-hidden rounded-card bg-[linear-gradient(135deg,var(--category-blue),var(--category-magenta),var(--category-amber))]"
        >
          <ui-glass-bar position="bottom" floating [sticky]="false">
            <span class="flex-1 text-sm font-medium">Barra de cristal</span>
            <ui-button size="sm">Confirmar</ui-button>
          </ui-glass-bar>
        </div>
      </div>
    </ng-template>

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
  protected readonly theme = inject(ThemeService);
  protected readonly palette = CATEGORY_COLORS;
  protected readonly sampleIcons = CATEGORY_ICONS.map((option) => option.key);
  protected readonly themeOptions: UiSegmentOption[] = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Oscuro' },
    { value: 'system', label: 'Sistema' },
  ];
  protected readonly segmentTabs: UiTabItem[] = [
    { id: 'month', label: 'Mes' },
    { id: 'year', label: 'Año' },
  ];
  protected readonly segmentTab = signal('month');

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

  protected onThemeChange(value: string): void {
    if (isThemePreference(value)) {
      this.theme.setPreference(value);
    }
  }

  protected toastFromLibrary(): void {
    yuwToast.success('Toast de yukit-web');
  }

  protected toastFromWrapper(): void {
    this.toast.success('Guardado');
  }
}

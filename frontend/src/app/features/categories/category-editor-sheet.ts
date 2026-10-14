import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { serverMessage, validationErrors } from '../../core/api/api-error';
import { CategoriesApi } from '../../core/api/categories.api';
import { Category, CategoryKind } from '../../core/api/models';
import {
  UiButton,
  UiInput,
  UiSelect,
  UiSelectOption,
  UiSheet,
  UiSheetFooter,
} from '../../shared/ui';
import { CATEGORY_COLORS, CATEGORY_ICONS, categoryColorKey } from './category-appearance';
import { CategoryIcon } from './category-icon';

const NAME_MAX_LENGTH = 60;
const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Gasto', income: 'Ingreso' };

export type CategoryEditorTarget =
  | { mode: 'create'; kind: CategoryKind; parent: Category | null; sortOrder: number }
  | { mode: 'edit'; category: Category; parentName: string | null };

@Component({
  selector: 'app-category-editor-sheet',
  imports: [CategoryIcon, UiButton, UiInput, UiSelect, UiSheet, UiSheetFooter],
  template: `
    <ui-sheet [(open)]="open" [title]="title()" [description]="context()">
      <form class="flex flex-col gap-5" novalidate (submit)="submit($event)">
        @if (failure(); as message) {
          <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {{ message }}
          </p>
        }
        <ui-input
          label="Nombre"
          name="name"
          [required]="true"
          [maxlength]="nameMaxLength"
          [(value)]="name"
          [state]="nameError() ? 'error' : 'default'"
          [hint]="nameError() ?? undefined"
        />

        <div class="flex items-end gap-3">
          <div class="min-w-0 flex-1">
            <ui-select
              label="Icono"
              name="icon"
              placeholder="Sin icono"
              [options]="iconOptions"
              [(value)]="icon"
            />
          </div>
          <app-category-icon class="mb-0.5" [icon]="icon()" [color]="color()" />
        </div>

        <fieldset>
          <legend class="mb-2 text-sm font-medium text-foreground">Color</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="color() === null"
              aria-label="Sin color"
              class="flex size-9 items-center justify-center rounded-full border border-border text-xs text-muted-foreground"
              [class.ring-2]="color() === null"
              [class.ring-ring]="color() === null"
              (click)="color.set(null)"
            >
              —
            </button>
            @for (swatch of colors; track swatch.value) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="selectedKey() === swatch.key"
                [attr.aria-label]="swatch.label"
                class="category-swatch size-9 rounded-full ring-offset-2 ring-offset-background"
                [class.ring-2]="selectedKey() === swatch.key"
                [class.ring-ring]="selectedKey() === swatch.key"
                [style.--category-color]="'var(--category-' + swatch.key + ')'"
                (click)="color.set(swatch.value)"
              ></button>
            }
          </div>
        </fieldset>
      </form>
      <div uiSheetFooter>
        <ui-button [fullWidth]="true" [loading]="saving()" (clicked)="submit($event)">
          {{ submitLabel() }}
        </ui-button>
      </div>
    </ui-sheet>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryEditorSheet {
  private readonly api = inject(CategoriesApi);

  readonly open = model(false);
  readonly target = input<CategoryEditorTarget | null>(null);
  readonly saved = output<Category>();

  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly colors = CATEGORY_COLORS;
  protected readonly iconOptions: UiSelectOption[] = CATEGORY_ICONS.map((option) => ({
    value: option.key,
    label: option.label,
  }));

  protected readonly name = signal('');
  protected readonly icon = signal<string | null>(null);
  protected readonly color = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  private readonly serverNameError = signal<string | null>(null);
  private readonly attempted = signal(false);

  protected readonly selectedKey = computed(() => categoryColorKey(this.color()));
  protected readonly title = computed(() => {
    const target = this.target();
    if (target === null || target.mode === 'edit') {
      return 'Editar categoría';
    }
    return target.parent === null ? 'Nueva categoría' : 'Nueva subcategoría';
  });
  protected readonly context = computed(() => {
    const target = this.target();
    if (target === null) {
      return undefined;
    }
    const kind = target.mode === 'create' ? target.kind : target.category.kind;
    const parentName = target.mode === 'create' ? (target.parent?.name ?? null) : target.parentName;
    return parentName === null
      ? `Tipo: ${KIND_LABELS[kind]}`
      : `Tipo: ${KIND_LABELS[kind]} · Dentro de ${parentName}`;
  });
  protected readonly submitLabel = computed(() =>
    this.target()?.mode === 'edit' ? 'Guardar cambios' : 'Crear',
  );
  protected readonly nameError = computed(() => {
    const name = this.name().trim();
    if (this.attempted() && name === '') {
      return 'Escribe un nombre.';
    }
    if (name.length > NAME_MAX_LENGTH) {
      return `El nombre no puede superar ${NAME_MAX_LENGTH} caracteres.`;
    }
    return this.serverNameError();
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.target();
    if (target === null || this.saving()) {
      return;
    }
    this.attempted.set(true);
    this.serverNameError.set(null);
    this.failure.set(null);
    if (this.nameError() !== null) {
      return;
    }
    this.saving.set(true);
    try {
      const appearance = { name: this.name().trim(), icon: this.icon(), color: this.color() };
      const saved = await firstValueFrom(
        target.mode === 'edit'
          ? this.api.update(target.category.id, appearance)
          : this.api.create({
              ...appearance,
              kind: target.parent?.kind ?? target.kind,
              parent_id: target.parent?.id ?? null,
              sort_order: target.sortOrder,
            }),
      );
      this.saved.emit(saved);
      this.open.set(false);
    } catch (error: unknown) {
      const fields = validationErrors(error);
      const nameError = fields?.['name'];
      if (nameError !== undefined) {
        this.serverNameError.set(nameError);
      } else {
        this.failure.set(serverMessage(error) ?? 'No se pudo guardar la categoría.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private reset(): void {
    const target = this.target();
    const category = target?.mode === 'edit' ? target.category : null;
    this.name.set(category?.name ?? '');
    this.icon.set(category?.icon ?? null);
    this.color.set(category?.color ?? null);
    this.attempted.set(false);
    this.serverNameError.set(null);
    this.failure.set(null);
  }
}

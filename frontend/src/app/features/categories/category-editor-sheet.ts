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
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBan, lucideCheck } from '@ng-icons/lucide';
import {
  UiAlert,
  UiButton,
  UiInput,
  UiSelect,
  UiSelectOption,
  UiSheet,
  UiSheetFooter,
} from '../../shared/ui';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CategoryColorKey,
  categoryColorKey,
  categoryColorValue,
} from './category-appearance';
import { CategoryIcon } from './category-icon';

const NAME_MAX_LENGTH = 60;
const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Gasto', income: 'Ingreso' };
const NO_COLOUR_LABEL = 'Sin color';

interface ColourChoice {
  id: string;
  key: CategoryColorKey | null;
  label: string;
}

const COLOUR_CHOICES: readonly ColourChoice[] = [
  { id: 'none', key: null, label: NO_COLOUR_LABEL },
  ...CATEGORY_COLORS.map((option) => ({ id: option.key, key: option.key, label: option.label })),
];

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

export type CategoryEditorTarget =
  | { mode: 'create'; kind: CategoryKind; parent: Category | null; sortOrder: number }
  | { mode: 'edit'; category: Category; parentName: string | null };

@Component({
  selector: 'app-category-editor-sheet',
  imports: [CategoryIcon, NgIcon, UiAlert, UiButton, UiInput, UiSelect, UiSheet, UiSheetFooter],
  providers: [provideIcons({ lucideBan, lucideCheck })],
  template: `
    <ui-sheet [(open)]="open" [title]="title()" [description]="context()">
      <form class="flex flex-col gap-5" novalidate (submit)="submit($event)">
        @if (failure(); as message) {
          <ui-alert>{{ message }}</ui-alert>
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
          <legend class="mb-2 flex items-baseline gap-2 text-sm font-medium text-foreground">
            Color
            <span class="font-normal text-muted-foreground" data-testid="selected-colour">{{
              selectedLabel()
            }}</span>
          </legend>
          <div
            class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2"
            role="radiogroup"
            aria-label="Color"
          >
            @for (choice of colourChoices; track choice.id; let index = $index) {
              <button
                type="button"
                role="radio"
                data-colour-choice
                [attr.aria-checked]="selectedKey() === choice.key"
                [attr.aria-label]="choice.label"
                [attr.tabindex]="focusIndex() === index ? 0 : -1"
                class="flex size-11 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                [class]="
                  choice.key === null
                    ? 'glass-fill text-muted-foreground'
                    : 'category-swatch text-background'
                "
                [class.ring-2]="selectedKey() === choice.key"
                [class.ring-ring]="selectedKey() === choice.key"
                [style.--category-color]="choice.key === null ? null : colourVar(choice.key)"
                (click)="selectColour(choice.key)"
                (keydown)="onSwatchKeydown($event)"
              >
                @if (selectedKey() === choice.key) {
                  <ng-icon name="lucideCheck" size="20" aria-hidden="true" />
                } @else if (choice.key === null) {
                  <ng-icon name="lucideBan" size="18" aria-hidden="true" />
                }
              </button>
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
  protected readonly colourChoices = COLOUR_CHOICES;
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
  protected readonly selectedLabel = computed(
    () => COLOUR_CHOICES.find((choice) => choice.key === this.selectedKey())?.label ?? '',
  );
  protected readonly focusIndex = computed(() =>
    Math.max(
      0,
      COLOUR_CHOICES.findIndex((choice) => choice.key === this.selectedKey()),
    ),
  );
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

  protected colourVar(key: CategoryColorKey): string {
    return `var(--category-${key})`;
  }

  protected selectColour(key: CategoryColorKey | null): void {
    this.color.set(key === null ? null : categoryColorValue(key));
  }

  protected onSwatchKeydown(event: KeyboardEvent): void {
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const count = COLOUR_CHOICES.length;
    const index = (this.focusIndex() + step + count) % count;
    const choice = COLOUR_CHOICES[index];
    if (choice === undefined) {
      return;
    }
    this.selectColour(choice.key);
    const group = (event.currentTarget as HTMLElement).parentElement;
    group?.querySelectorAll<HTMLElement>('[data-colour-choice]')[index]?.focus();
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

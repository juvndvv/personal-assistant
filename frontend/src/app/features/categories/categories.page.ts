import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideArchiveRestore,
  lucideChevronDown,
  lucideChevronUp,
  lucidePencil,
  lucidePlus,
  lucideTrash2,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { conflictCode, serverMessage } from '../../core/api/api-error';
import { CategoriesApi } from '../../core/api/categories.api';
import { Category, CategoryKind } from '../../core/api/models';
import { PageHeader } from '../../shared/layout/page-header';
import {
  UiBadge,
  UiButton,
  UiCheckbox,
  UiDialog,
  UiDialogFooter,
  UiTabItem,
  UiTabs,
  UiToast,
} from '../../shared/ui';
import { CATEGORY_ICON_SVGS, iconNameFor } from './category-appearance';
import { CategoryEditorSheet, CategoryEditorTarget } from './category-editor-sheet';
import { MoveDirection, nextSortOrder, siblingsOf, sortOrderChangesForMove } from './category-tree';

const CONFLICT_MESSAGES: Record<string, string> = {
  category_in_use:
    'Esta categoría se usa en movimientos, plantillas o borradores. Archívala para ocultarla sin perder el historial.',
  category_has_children: 'Esta categoría tiene subcategorías. Elimínalas o archívala.',
};

const KIND_TABS: readonly UiTabItem[] = [
  { id: 'expense', label: 'Gastos' },
  { id: 'income', label: 'Ingresos' },
];

@Component({
  selector: 'app-categories-page',
  imports: [
    CategoryEditorSheet,
    NgIcon,
    NgTemplateOutlet,
    PageHeader,
    RouterLink,
    UiBadge,
    UiButton,
    UiCheckbox,
    UiDialog,
    UiDialogFooter,
    UiTabs,
  ],
  providers: [
    provideIcons({
      ...CATEGORY_ICON_SVGS,
      lucideArchive,
      lucideArchiveRestore,
      lucideChevronDown,
      lucideChevronUp,
      lucidePencil,
      lucidePlus,
      lucideTrash2,
    }),
  ],
  template: `
    <a
      routerLink="/mas"
      class="mb-4 inline-flex min-w-11 items-center text-sm text-primary-text hover:underline"
      >← Más</a
    >
    <app-page-header title="Categorías" subtitle="Organiza tus gastos e ingresos en dos niveles." />

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <ui-tabs
        ariaLabel="Tipo de categoría"
        idPrefix="category-kind"
        panelId="category-panel"
        [tabs]="kindTabs"
        [active]="kind()"
        (activeChange)="selectKind($event)"
      />
      <ui-checkbox
        name="include_archived"
        [checked]="includeArchived()"
        (checkedChange)="toggleArchived($event)"
      >
        Mostrar archivadas
      </ui-checkbox>
    </div>

    <section id="category-panel" role="tabpanel" [attr.aria-labelledby]="'category-kind-' + kind()">
      @if (loadFailed()) {
        <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No se pudieron cargar las categorías.
        </p>
      }

      <ul
        class="flex flex-col gap-3"
        [attr.aria-label]="kind() === 'expense' ? 'Gastos' : 'Ingresos'"
      >
        @for (parent of tree(); track parent.id; let first = $first; let last = $last) {
          <li
            class="rounded-2xl border border-border bg-background"
            [attr.data-testid]="'category-' + parent.id"
          >
            <ng-container
              [ngTemplateOutlet]="row"
              [ngTemplateOutletContext]="{ $implicit: parent, first, last }"
            />
            @if (parent.children.length > 0) {
              <ul
                class="border-t border-border"
                [attr.aria-label]="'Subcategorías de ' + parent.name"
              >
                @for (
                  child of parent.children;
                  track child.id;
                  let childFirst = $first;
                  let childLast = $last
                ) {
                  <li class="ps-6" [attr.data-testid]="'category-' + child.id">
                    <ng-container
                      [ngTemplateOutlet]="row"
                      [ngTemplateOutletContext]="{
                        $implicit: child,
                        first: childFirst,
                        last: childLast,
                      }"
                    />
                  </li>
                }
              </ul>
            }
          </li>
        }
      </ul>

      <div class="mt-4">
        <ui-button variant="outline" (clicked)="createTopLevel()">
          <ng-icon name="lucidePlus" aria-hidden="true" />
          Nueva categoría
        </ui-button>
      </div>
    </section>

    <ng-template #row let-category let-first="first" let-last="last">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted"
          [style.color]="category.color"
          aria-hidden="true"
        >
          <ng-icon [name]="iconName(category.icon)" size="18" />
        </span>
        <span class="flex min-w-0 flex-1 basis-40 items-center">
          <span
            class="truncate"
            [class]="
              category.parent_id === null ? 'font-medium text-foreground' : 'text-foreground'
            "
          >
            {{ category.name }}
          </span>
          @if (category.archived_at !== null) {
            <ui-badge tone="neutral" class="ms-2">Archivada</ui-badge>
          }
        </span>
        <span class="ms-auto flex shrink-0 items-center">
          <ui-button
            variant="ghost"
            size="icon"
            [disabled]="first || busy()"
            [ariaLabel]="'Subir ' + category.name"
            (clicked)="move(category, -1)"
          >
            <ng-icon name="lucideChevronUp" aria-hidden="true" />
          </ui-button>
          <ui-button
            variant="ghost"
            size="icon"
            [disabled]="last || busy()"
            [ariaLabel]="'Bajar ' + category.name"
            (clicked)="move(category, 1)"
          >
            <ng-icon name="lucideChevronDown" aria-hidden="true" />
          </ui-button>
          @if (category.parent_id === null && category.archived_at === null) {
            <ui-button
              variant="ghost"
              size="icon"
              [ariaLabel]="'Añadir subcategoría a ' + category.name"
              (clicked)="createChild(category)"
            >
              <ng-icon name="lucidePlus" aria-hidden="true" />
            </ui-button>
          }
          <ui-button
            variant="ghost"
            size="icon"
            [ariaLabel]="'Editar ' + category.name"
            (clicked)="edit(category)"
          >
            <ng-icon name="lucidePencil" aria-hidden="true" />
          </ui-button>
          @if (category.archived_at === null) {
            <ui-button
              variant="ghost"
              size="icon"
              [disabled]="busy()"
              [ariaLabel]="'Archivar ' + category.name"
              (clicked)="archive(category)"
            >
              <ng-icon name="lucideArchive" aria-hidden="true" />
            </ui-button>
          } @else {
            <ui-button
              variant="ghost"
              size="icon"
              [disabled]="busy()"
              [ariaLabel]="'Desarchivar ' + category.name"
              (clicked)="unarchive(category)"
            >
              <ng-icon name="lucideArchiveRestore" aria-hidden="true" />
            </ui-button>
          }
          <ui-button
            variant="ghost"
            size="icon"
            [ariaLabel]="'Eliminar ' + category.name"
            (clicked)="confirmDelete(category)"
          >
            <ng-icon name="lucideTrash2" aria-hidden="true" />
          </ui-button>
        </span>
      </div>
    </ng-template>

    <app-category-editor-sheet
      [(open)]="editorOpen"
      [target]="editorTarget()"
      (saved)="onSaved()"
    />

    <ui-dialog [(open)]="deleteOpen" title="Eliminar categoría" [description]="deleteDescription()">
      @if (deleteError(); as message) {
        <p role="alert" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {{ message }}
        </p>
      }
      <div uiDialogFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ui-button variant="outline" (clicked)="deleteOpen.set(false)">Cancelar</ui-button>
        @if (deleteError() === null) {
          <ui-button variant="danger" [loading]="busy()" (clicked)="remove()">Eliminar</ui-button>
        }
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesPage {
  private readonly api = inject(CategoriesApi);
  private readonly toast = inject(UiToast);

  protected readonly kindTabs = KIND_TABS;
  protected readonly kind = signal<CategoryKind>('expense');
  protected readonly includeArchived = signal(false);
  protected readonly tree = signal<Category[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly busy = signal(false);
  protected readonly editorOpen = signal(false);
  protected readonly editorTarget = signal<CategoryEditorTarget | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteCandidate = signal<Category | null>(null);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly deleteDescription = computed(
    () => `¿Seguro que quieres eliminar ${this.deleteCandidate()?.name ?? 'esta categoría'}?`,
  );
  protected readonly iconName = iconNameFor;
  private latestRequest = 0;

  constructor() {
    void this.load();
  }

  protected selectKind(kind: string): void {
    if (kind === 'expense' || kind === 'income') {
      this.kind.set(kind);
      void this.load();
    }
  }

  protected toggleArchived(include: boolean): void {
    this.includeArchived.set(include);
    void this.load();
  }

  protected createTopLevel(): void {
    this.openEditor({
      mode: 'create',
      kind: this.kind(),
      parent: null,
      sortOrder: nextSortOrder(this.tree()),
    });
  }

  protected createChild(parent: Category): void {
    this.openEditor({
      mode: 'create',
      kind: parent.kind,
      parent,
      sortOrder: nextSortOrder(parent.children),
    });
  }

  protected edit(category: Category): void {
    const parentName =
      category.parent_id === null
        ? null
        : (this.tree().find((node) => node.id === category.parent_id)?.name ?? null);
    this.openEditor({ mode: 'edit', category, parentName });
  }

  protected onSaved(): void {
    this.toast.success('Categoría guardada');
    void this.load();
  }

  protected async move(category: Category, direction: MoveDirection): Promise<void> {
    const changes = sortOrderChangesForMove(
      siblingsOf(this.tree(), category),
      category.id,
      direction,
    );
    await this.run(async () => {
      for (const change of changes) {
        await firstValueFrom(this.api.update(change.id, { sort_order: change.sort_order }));
      }
    });
  }

  protected async archive(category: Category): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.archive(category.id));
      this.toast.success(`${category.name} archivada`);
    });
  }

  protected async unarchive(category: Category): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.api.unarchive(category.id));
      this.toast.success(`${category.name} desarchivada`);
    });
  }

  protected confirmDelete(category: Category): void {
    this.deleteCandidate.set(category);
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const category = this.deleteCandidate();
    if (category === null) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(category.id));
      this.deleteOpen.set(false);
      this.toast.success('Categoría eliminada');
      await this.load();
    } catch (error: unknown) {
      const code = conflictCode(error);
      this.deleteError.set(
        (code === null ? undefined : CONFLICT_MESSAGES[code]) ??
          serverMessage(error) ??
          'No se pudo eliminar la categoría.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private openEditor(target: CategoryEditorTarget): void {
    this.editorTarget.set(target);
    this.editorOpen.set(true);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await action();
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo completar la acción.');
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const request = ++this.latestRequest;
    try {
      const tree = await firstValueFrom(
        this.api.list({ kind: this.kind(), includeArchived: this.includeArchived() }),
      );
      if (request === this.latestRequest) {
        this.tree.set(tree);
        this.loadFailed.set(false);
      }
    } catch {
      if (request === this.latestRequest) {
        this.loadFailed.set(true);
      }
    }
  }
}

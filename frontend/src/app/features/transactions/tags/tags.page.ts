import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { conflictCode, serverMessage, validationErrors } from '../../../core/api/api-error';
import { Tag } from '../../../core/api/models';
import { TagsApi } from '../../../core/api/tags.api';
import { PageHeader } from '../../../shared/layout/page-header';
import {
  UiAlert,
  UiButton,
  UiCard,
  UiDialog,
  UiDialogFooter,
  UiEmptyState,
  UiInput,
  UiSkeletonList,
  UiToast,
} from '../../../shared/ui';
import { MAX_TAG_LENGTH, normalizeTagName } from '../tag-input/tag-names';

export const TAG_NAME_TAKEN_MESSAGE = 'Ya existe una etiqueta con ese nombre.';

@Component({
  selector: 'app-tags-page',
  imports: [
    PageHeader,
    UiAlert,
    UiButton,
    UiCard,
    UiDialog,
    UiDialogFooter,
    UiEmptyState,
    UiInput,
    UiSkeletonList,
  ],
  template: `
    <app-page-header
      title="Etiquetas"
      subtitle="Las etiquetas agrupan movimientos de distintas categorías, por ejemplo un viaje."
      backLink="/mas"
      backLabel="Más"
    />
    @if (loadFailed()) {
      <ui-alert retryable [retrying]="loading()" (retry)="reload()">
        No se pudieron cargar las etiquetas.
      </ui-alert>
    } @else if (!loaded()) {
      <ui-card padding="none">
        <ui-skeleton-list label="Cargando etiquetas" [rows]="4" />
      </ui-card>
    } @else if (tags().length === 0) {
      <ui-empty-state
        title="Aún no tienes etiquetas"
        description="Añade etiquetas desde «Más detalles» al registrar un movimiento."
      />
    } @else {
      <ul uiCard divided aria-label="Etiquetas">
        @for (tag of tags(); track tag.id) {
          <li class="flex items-center gap-3 px-4 py-3">
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-foreground">{{ tag.name }}</span>
              <span class="block text-sm text-muted-foreground">{{ usage(tag) }}</span>
            </span>
            <ui-button
              variant="ghost"
              size="sm"
              [ariaLabel]="'Renombrar ' + tag.name"
              (clicked)="openRename(tag)"
            >
              Renombrar
            </ui-button>
            <ui-button
              variant="ghost"
              size="sm"
              [ariaLabel]="'Eliminar ' + tag.name"
              (clicked)="deleteTarget.set(tag)"
            >
              Eliminar
            </ui-button>
          </li>
        }
      </ul>
    }

    <ui-dialog
      [open]="renameTarget() !== null"
      (openChange)="onRenameOpenChange($event)"
      title="Renombrar etiqueta"
    >
      <form id="rename-tag-form" novalidate (submit)="rename($event)">
        <ui-input
          label="Nombre"
          name="name"
          [maxlength]="maxLength"
          [(value)]="newName"
          [state]="renameError() ? 'error' : 'default'"
          [hint]="renameError() ?? undefined"
        />
      </form>
      <div uiDialogFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ui-button variant="outline" (clicked)="renameTarget.set(null)">Cancelar</ui-button>
        <ui-button [loading]="busy()" (clicked)="rename($event)">Guardar</ui-button>
      </div>
    </ui-dialog>

    <ui-dialog
      [open]="deleteTarget() !== null"
      (openChange)="$event || deleteTarget.set(null)"
      title="Eliminar etiqueta"
      [description]="
        '¿Eliminar «' + (deleteTarget()?.name ?? '') + '»? Se quitará de todos sus movimientos.'
      "
    >
      <div uiDialogFooter class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ui-button variant="outline" (clicked)="deleteTarget.set(null)">Cancelar</ui-button>
        <ui-button variant="danger" [loading]="busy()" (clicked)="remove()">Eliminar</ui-button>
      </div>
    </ui-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagsPage {
  private readonly api = inject(TagsApi);
  private readonly toast = inject(UiToast);

  protected readonly maxLength = MAX_TAG_LENGTH;
  protected readonly tags = signal<Tag[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly renameTarget = signal<Tag | null>(null);
  protected readonly deleteTarget = signal<Tag | null>(null);
  protected readonly newName = signal('');
  protected readonly renameError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected usage(tag: Tag): string {
    const count = tag.usage_count ?? 0;
    return count === 1 ? '1 movimiento' : `${count} movimientos`;
  }

  protected openRename(tag: Tag): void {
    this.newName.set(tag.name);
    this.renameError.set(null);
    this.renameTarget.set(tag);
  }

  protected onRenameOpenChange(open: boolean): void {
    if (!open) {
      this.renameTarget.set(null);
    }
  }

  protected async rename(event: Event): Promise<void> {
    event.preventDefault();
    const tag = this.renameTarget();
    if (tag === null || this.busy()) {
      return;
    }
    const name = normalizeTagName(this.newName());
    if (name === '') {
      this.renameError.set('Indica un nombre.');
      return;
    }
    this.busy.set(true);
    try {
      const renamed = await firstValueFrom(this.api.rename(tag.id, name));
      this.tags.update((tags) =>
        tags.map((existing) =>
          existing.id === tag.id ? { ...existing, name: renamed.name } : existing,
        ),
      );
      this.renameTarget.set(null);
      this.toast.success('Etiqueta renombrada');
    } catch (error: unknown) {
      this.renameError.set(
        conflictCode(error) === 'tag_name_taken'
          ? TAG_NAME_TAKEN_MESSAGE
          : (validationErrors(error)?.['name'] ??
              serverMessage(error) ??
              'No se pudo renombrar la etiqueta.'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const tag = this.deleteTarget();
    if (tag === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(tag.id), { defaultValue: undefined });
      this.tags.update((tags) => tags.filter((existing) => existing.id !== tag.id));
      this.deleteTarget.set(null);
      this.toast.success('Etiqueta eliminada');
    } catch (error: unknown) {
      this.toast.error(serverMessage(error) ?? 'No se pudo eliminar la etiqueta.');
    } finally {
      this.busy.set(false);
    }
  }

  protected reload(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.tags.set(await firstValueFrom(this.api.list()));
      this.loadFailed.set(false);
      this.loaded.set(true);
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}

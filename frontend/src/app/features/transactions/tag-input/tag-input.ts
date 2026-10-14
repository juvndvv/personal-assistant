import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { TagsApi } from '../../../core/api/tags.api';
import { Tag } from '../../../core/api/models';
import { UiCombobox, UiComboboxOption } from '../../../shared/ui';
import { nextUiId } from '../../../shared/ui/ui-types';
import { MAX_TAGS, MAX_TAG_LENGTH, addTagName, normalizeTagName } from './tag-names';

export const TAG_SEARCH_DEBOUNCE_MS = 200;
const CREATE_PREFIX = 'create:';

@Component({
  selector: 'app-tag-input',
  imports: [NgIcon, UiCombobox],
  providers: [provideIcons({ lucideX })],
  template: `
    <div class="flex flex-col gap-2">
      <ui-combobox
        [inputId]="inputId()"
        [label]="label()"
        [placeholder]="full() ? 'Máximo ' + maxTags + ' etiquetas' : 'Escribe y pulsa Intro'"
        [disabled]="full()"
        [maxlength]="maxLength"
        [options]="options()"
        [(query)]="query"
        (optionSelected)="onOptionSelected($event)"
        (submitted)="add($event)"
        (backspaceOnEmpty)="removeLast()"
      />
      @if (tags().length > 0) {
        <ul class="flex flex-wrap gap-2" [attr.aria-label]="label()">
          @for (tag of tags(); track tag) {
            <li
              class="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 ps-3 pe-1 text-sm text-primary-text"
            >
              {{ tag }}
              <button
                type="button"
                class="inline-flex size-6 items-center justify-center rounded-full hover:bg-primary/20"
                [attr.aria-label]="'Quitar etiqueta ' + tag"
                (click)="remove(tag)"
              >
                <ng-icon name="lucideX" size="14" aria-hidden="true" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TagInput {
  private readonly api = inject(TagsApi);

  readonly tags = model<string[]>([]);
  readonly label = input('Etiquetas');
  readonly inputId = input(nextUiId('tag-input'));

  protected readonly maxTags = MAX_TAGS;
  protected readonly maxLength = MAX_TAG_LENGTH;
  protected readonly query = signal('');
  private readonly suggestions = signal<Tag[]>([]);

  protected readonly full = computed(() => this.tags().length >= MAX_TAGS);
  protected readonly options = computed<UiComboboxOption[]>(() => {
    const selected = new Set(this.tags());
    const typed = normalizeTagName(this.query());
    const matches = this.suggestions()
      .filter((tag) => !selected.has(tag.name))
      .map((tag) => ({ value: tag.name, label: tag.name }));
    const exists = typed === '' || selected.has(typed) || matches.some((m) => m.value === typed);
    return exists
      ? matches
      : [...matches, { value: CREATE_PREFIX + typed, label: `Crear «${typed}»` }];
  });

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(TAG_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((term) =>
          term.trim() === '' ? of<Tag[]>([]) : this.api.list(term).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((tags) => this.suggestions.set(tags));
  }

  protected onOptionSelected(option: UiComboboxOption): void {
    this.add(
      option.value.startsWith(CREATE_PREFIX)
        ? option.value.slice(CREATE_PREFIX.length)
        : option.value,
    );
  }

  protected add(raw: string): void {
    this.tags.set(addTagName(this.tags(), raw));
    this.query.set('');
    this.suggestions.set([]);
  }

  protected remove(tag: string): void {
    this.tags.set(this.tags().filter((existing) => existing !== tag));
  }

  protected removeLast(): void {
    this.tags.set(this.tags().slice(0, -1));
  }
}

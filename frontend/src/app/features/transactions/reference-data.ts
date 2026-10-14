import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { CategoriesApi } from '../../core/api/categories.api';
import { Account, Category, CategoryKind } from '../../core/api/models';

export interface CategoryOption {
  id: number;
  kind: CategoryKind;
  name: string;
  label: string;
  icon: string | null;
  color: string | null;
}

export interface CategoryVisual {
  icon: string | null;
  color: string | null;
}

type CategoryAppearance = Pick<Category, 'icon' | 'color'>;

export function categoryVisual(
  category: CategoryAppearance,
  parent: CategoryAppearance | null = null,
): CategoryVisual {
  return {
    icon: category.icon ?? parent?.icon ?? null,
    color: category.color ?? parent?.color ?? null,
  };
}

export function flattenCategories(tree: readonly Category[]): CategoryOption[] {
  return tree.flatMap((parent) => [
    toOption(parent, parent.name, categoryVisual(parent)),
    ...parent.children.map((child) =>
      toOption(child, `${parent.name} › ${child.name}`, categoryVisual(child, parent)),
    ),
  ]);
}

function toOption(category: Category, label: string, visual: CategoryVisual): CategoryOption {
  return {
    id: category.id,
    kind: category.kind,
    name: category.name,
    label,
    ...visual,
  };
}

@Injectable({ providedIn: 'root' })
export class LedgerReferenceData {
  private readonly accountsApi = inject(AccountsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly allAccounts = signal<Account[]>([]);
  private readonly categoryTree = signal<Category[]>([]);
  private readonly ready = signal(false);
  private readonly loadError = signal(false);
  private readonly inFlight = signal(false);
  private pending: Promise<void> | null = null;

  readonly loaded = this.ready.asReadonly();
  readonly failed = computed(() => this.loadError() && !this.ready());
  readonly refreshing = this.inFlight.asReadonly();
  readonly accounts = this.allAccounts.asReadonly();
  readonly writableAccounts = computed(() =>
    this.allAccounts().filter((account) => account.archived_at === null),
  );
  readonly categories = computed(() => flattenCategories(this.categoryTree()));
  readonly categoryById = computed(
    () => new Map(this.categories().map((category) => [category.id, category])),
  );

  visualOf(categoryId: number): CategoryVisual {
    const category = this.categoryById().get(categoryId);
    return { icon: category?.icon ?? null, color: category?.color ?? null };
  }

  categoriesOf(kind: CategoryKind): CategoryOption[] {
    return this.categories().filter((category) => category.kind === kind);
  }

  ensureLoaded(): Promise<void> {
    if (this.ready()) {
      void this.refresh().catch(() => undefined);
      return Promise.resolve();
    }
    return this.refresh();
  }

  retry(): void {
    void this.refresh().catch(() => undefined);
  }

  refresh(): Promise<void> {
    this.inFlight.set(true);
    this.pending ??= firstValueFrom(
      forkJoin({ accounts: this.accountsApi.list(true), categories: this.categoriesApi.list() }),
    )
      .then(({ accounts, categories }) => {
        this.allAccounts.set(accounts);
        this.categoryTree.set(categories);
        this.ready.set(true);
        this.loadError.set(false);
      })
      .catch((error: unknown) => {
        this.loadError.set(true);
        throw error;
      })
      .finally(() => {
        this.pending = null;
        this.inFlight.set(false);
      });
    return this.pending;
  }
}

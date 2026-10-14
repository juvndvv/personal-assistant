import { computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EntryType } from '../../core/api/models';
import { CategorizationQuery, SuggestionsApi } from '../../core/api/suggestions.api';

export const HISTORY_SUGGESTION_LABEL = 'Sugerido por tu historial';

export interface CategorizationTargets {
  acceptsCategory(id: number): boolean;
  acceptsAccount(id: number): boolean;
  currentCategory(): number | null;
  currentAccount(): number | null;
  applyCategory(id: number | null): void;
  applyAccount(id: number | null): void;
}

export interface CategorizationText {
  merchant: string;
  description: string;
}

function lookupKey(query: CategorizationQuery): string | null {
  const merchant = query.merchant.trim().toLocaleLowerCase('es');
  const description = query.description.trim().toLocaleLowerCase('es');
  return merchant === '' && description === ''
    ? null
    : JSON.stringify([query.type, merchant, description]);
}

export class CategorizationAssist {
  private readonly categoryTouched = signal(false);
  private readonly accountTouched = signal(false);
  private readonly categoryFromHistory = signal(false);
  private readonly accountFromHistory = signal(false);
  private categoryBeforeHistory: number | null = null;
  private accountBeforeHistory: number | null = null;
  private lastKey: string | null = null;
  private generation = 0;

  readonly categorySuggested = this.categoryFromHistory.asReadonly();
  readonly accountSuggested = this.accountFromHistory.asReadonly();
  readonly active = computed(() => this.categoryFromHistory() || this.accountFromHistory());

  constructor(private readonly api: SuggestionsApi) {}

  reset(type: EntryType, known: CategorizationText = { merchant: '', description: '' }): void {
    this.generation += 1;
    this.categoryTouched.set(false);
    this.accountTouched.set(false);
    this.categoryFromHistory.set(false);
    this.accountFromHistory.set(false);
    this.categoryBeforeHistory = null;
    this.accountBeforeHistory = null;
    this.lastKey = lookupKey({ type, ...known });
  }

  touchCategory(): void {
    this.categoryTouched.set(true);
    this.categoryFromHistory.set(false);
  }

  touchAccount(): void {
    this.accountTouched.set(true);
    this.accountFromHistory.set(false);
  }

  typeChanged(): void {
    this.generation += 1;
    this.categoryTouched.set(false);
    this.categoryFromHistory.set(false);
    this.categoryBeforeHistory = null;
    this.lastKey = null;
  }

  async lookup(query: CategorizationQuery, targets: CategorizationTargets): Promise<void> {
    const key = lookupKey(query);
    if (key === null || key === this.lastKey) {
      return;
    }
    this.lastKey = key;
    if (this.categoryTouched() && this.accountTouched()) {
      return;
    }
    const generation = ++this.generation;
    const suggestion = await firstValueFrom(this.api.categorization(query)).catch(() => {
      if (generation === this.generation) {
        this.lastKey = null;
      }
      return null;
    });
    if (generation !== this.generation) {
      return;
    }
    const categoryId = this.categoryTouched() ? null : (suggestion?.category_id ?? null);
    const usableCategory =
      categoryId !== null && targets.acceptsCategory(categoryId) ? categoryId : null;
    const accountId = this.accountTouched() ? null : (suggestion?.account_id ?? null);
    const usableAccount =
      accountId !== null && targets.acceptsAccount(accountId) ? accountId : null;
    this.settleCategory(usableCategory, targets);
    this.settleAccount(usableAccount, targets);
  }

  private settleCategory(suggested: number | null, targets: CategorizationTargets): void {
    if (suggested !== null) {
      if (!this.categoryFromHistory()) {
        this.categoryBeforeHistory = targets.currentCategory();
      }
      targets.applyCategory(suggested);
      this.categoryFromHistory.set(true);
    } else if (this.categoryFromHistory() && !this.categoryTouched()) {
      targets.applyCategory(this.categoryBeforeHistory);
      this.categoryFromHistory.set(false);
    }
  }

  private settleAccount(suggested: number | null, targets: CategorizationTargets): void {
    if (suggested !== null) {
      if (!this.accountFromHistory()) {
        this.accountBeforeHistory = targets.currentAccount();
      }
      targets.applyAccount(suggested);
      this.accountFromHistory.set(true);
    } else if (this.accountFromHistory() && !this.accountTouched()) {
      targets.applyAccount(this.accountBeforeHistory);
      this.accountFromHistory.set(false);
    }
  }
}

export function injectCategorizationAssist(): CategorizationAssist {
  return new CategorizationAssist(inject(SuggestionsApi));
}

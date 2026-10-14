import { Provider } from '@angular/core';
import { of } from 'rxjs';
import { AccountsApi } from '../../../core/api/accounts.api';
import { CategoriesApi } from '../../../core/api/categories.api';
import { Category } from '../../../core/api/models';

export function referenceDataProviders(categories: readonly Category[] = []): Provider[] {
  return [
    { provide: AccountsApi, useValue: { list: () => of([]) } },
    { provide: CategoriesApi, useValue: { list: () => of(categories) } },
  ];
}

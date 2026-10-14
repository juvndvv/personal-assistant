import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AccountsApi } from '../../core/api/accounts.api';
import { CategoriesApi } from '../../core/api/categories.api';
import { anAccount } from '../accounts/testing/account-fixtures';
import { LedgerReferenceData } from './reference-data';

function setup(accountsList: ReturnType<typeof vi.fn>): LedgerReferenceData {
  TestBed.configureTestingModule({
    providers: [
      { provide: AccountsApi, useValue: { list: accountsList } },
      { provide: CategoriesApi, useValue: { list: vi.fn(() => of([])) } },
    ],
  });
  return TestBed.inject(LedgerReferenceData);
}

describe('LedgerReferenceData', () => {
  it('reports a failed first load and clears it once a retry succeeds', async () => {
    const accountsList = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValue(of([anAccount({ id: 3 })]));
    const reference = setup(accountsList);

    await expect(reference.ensureLoaded()).rejects.toThrow('offline');
    expect(reference.failed()).toBe(true);
    expect(reference.refreshing()).toBe(false);

    await reference.refresh();

    expect(reference.failed()).toBe(false);
    expect(reference.accounts().map((account) => account.id)).toEqual([3]);
  });

  it('keeps showing loaded data when a background refresh fails', async () => {
    const accountsList = vi
      .fn()
      .mockReturnValueOnce(of([anAccount({ id: 3 })]))
      .mockReturnValue(throwError(() => new Error('offline')));
    const reference = setup(accountsList);
    await reference.ensureLoaded();

    await expect(reference.refresh()).rejects.toThrow('offline');

    expect(reference.failed()).toBe(false);
    expect(reference.loaded()).toBe(true);
  });
});

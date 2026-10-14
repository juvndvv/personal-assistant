import { Observable, of, throwError } from 'rxjs';
import {
  CategorizationQuery,
  CategorizationSuggestion,
  SuggestionsApi,
} from '../../core/api/suggestions.api';
import { CategorizationAssist, CategorizationTargets } from './categorization-assist';

const SUGGESTION: CategorizationSuggestion = {
  category_id: 34,
  account_id: 26,
  source: 'history',
  hits: 1,
};

const QUERY: CategorizationQuery = { type: 'expense', merchant: 'Mercadona', description: '' };

function fakeApi(responses: Observable<CategorizationSuggestion | null>[]) {
  const calls: CategorizationQuery[] = [];
  const api = {
    categorization(query: CategorizationQuery) {
      calls.push(query);
      return responses.shift() ?? of(null);
    },
  } as unknown as SuggestionsApi;
  return { api, calls };
}

function recordingTargets(
  initial: { category: number | null; account: number | null } = {
    category: null,
    account: null,
  },
) {
  const applied = { ...initial };
  const targets: CategorizationTargets = {
    acceptsCategory: () => true,
    acceptsAccount: () => true,
    currentCategory: () => applied.category,
    currentAccount: () => applied.account,
    applyCategory: (id) => (applied.category = id),
    applyAccount: (id) => (applied.account = id),
  };
  return { targets, applied };
}

describe('CategorizationAssist', () => {
  it('applies a history suggestion and skips a repeated lookup for the same text', async () => {
    const { api, calls } = fakeApi([of(SUGGESTION)]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets();
    assist.reset('expense');

    await assist.lookup(QUERY, targets);
    await assist.lookup({ ...QUERY, merchant: ' MERCADONA ' }, targets);

    expect(calls).toHaveLength(1);
    expect(applied).toEqual({ category: 34, account: 26 });
    expect(assist.active()).toBe(true);
  });

  it('retries the same text after a failed lookup', async () => {
    const { api, calls } = fakeApi([throwError(() => new Error('503')), of(SUGGESTION)]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets();
    assist.reset('expense');

    await assist.lookup(QUERY, targets);
    expect(applied).toEqual({ category: null, account: null });

    await assist.lookup(QUERY, targets);

    expect(calls).toHaveLength(2);
    expect(applied).toEqual({ category: 34, account: 26 });
  });

  it('restores the values from before history when a later merchant has no hint', async () => {
    const { api } = fakeApi([of(SUGGESTION), of(null)]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets({ category: null, account: 7 });
    assist.reset('expense');

    await assist.lookup(QUERY, targets);
    expect(applied).toEqual({ category: 34, account: 26 });
    expect(assist.active()).toBe(true);

    await assist.lookup({ ...QUERY, merchant: 'Zara' }, targets);

    expect(applied).toEqual({ category: null, account: 7 });
    expect(assist.categorySuggested()).toBe(false);
    expect(assist.accountSuggested()).toBe(false);
    expect(assist.active()).toBe(false);
  });

  it('restores only the account when a later hint has no account', async () => {
    const { api } = fakeApi([
      of(SUGGESTION),
      of({ ...SUGGESTION, category_id: 35, account_id: null }),
    ]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets({ category: null, account: 7 });
    assist.reset('expense');

    await assist.lookup(QUERY, targets);
    await assist.lookup({ ...QUERY, merchant: 'Zara' }, targets);

    expect(applied).toEqual({ category: 35, account: 7 });
    expect(assist.categorySuggested()).toBe(true);
    expect(assist.accountSuggested()).toBe(false);
  });

  it('restores the account when a later hint names an account that is not offered', async () => {
    const { api } = fakeApi([of(SUGGESTION), of({ ...SUGGESTION, account_id: 99 })]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets({ category: null, account: 7 });
    const offered: CategorizationTargets = { ...targets, acceptsAccount: (id) => id !== 99 };
    assist.reset('expense');

    await assist.lookup(QUERY, offered);
    await assist.lookup({ ...QUERY, merchant: 'Zara' }, offered);

    expect(applied).toEqual({ category: 34, account: 7 });
    expect(assist.categorySuggested()).toBe(true);
    expect(assist.accountSuggested()).toBe(false);
  });

  it('keeps the value from before the first suggestion across consecutive suggestions', async () => {
    const { api } = fakeApi([
      of(SUGGESTION),
      of({ ...SUGGESTION, category_id: 35, account_id: 27 }),
      of(null),
    ]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets({ category: 12, account: 7 });
    assist.reset('expense');

    await assist.lookup(QUERY, targets);
    await assist.lookup({ ...QUERY, merchant: 'Lidl' }, targets);
    expect(applied).toEqual({ category: 35, account: 27 });

    await assist.lookup({ ...QUERY, merchant: 'Zara' }, targets);

    expect(applied).toEqual({ category: 12, account: 7 });
  });

  it('keeps a value the user picked after a suggestion when a later merchant has no hint', async () => {
    const { api } = fakeApi([of(SUGGESTION), of(null)]);
    const assist = new CategorizationAssist(api);
    const { targets, applied } = recordingTargets({ category: null, account: 7 });
    assist.reset('expense');

    await assist.lookup(QUERY, targets);
    applied.category = 40;
    assist.touchCategory();
    await assist.lookup({ ...QUERY, merchant: 'Zara' }, targets);

    expect(applied).toEqual({ category: 40, account: 7 });
    expect(assist.active()).toBe(false);
  });
});

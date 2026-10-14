import { Observable, of } from 'rxjs';
import { CategorizationSuggestion } from '../../../core/api/suggestions.api';

export function aSuggestion(
  overrides: Partial<CategorizationSuggestion> = {},
): CategorizationSuggestion {
  return { category_id: 11, account_id: 4, source: 'history', hits: 3, ...overrides };
}

export function quietSuggestionsApi(suggestion: CategorizationSuggestion | null = null) {
  return {
    categorization: (): Observable<CategorizationSuggestion | null> => of(suggestion),
  };
}

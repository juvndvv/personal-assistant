<?php

declare(strict_types=1);

namespace App\Actions\Suggestions;

use App\Domain\Suggestions\CategorizationSuggestion;
use App\Domain\Text\HintKey;
use App\Enums\CategoryKind;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Facades\DB;

final class SuggestCategorization
{
    public const string MIN_SIMILARITY = '0.6';

    public function handle(CategoryKind $kind, ?string $merchant, ?string $description): ?CategorizationSuggestion
    {
        $keys = array_values(array_unique(array_filter(
            [HintKey::normalize($merchant), HintKey::normalize($description)],
            fn (?string $key): bool => $key !== null,
        )));

        foreach ($keys as $key) {
            $hint = $this->usableHints($kind)->where('categorization_hints.key', $key)->first();

            if ($hint !== null) {
                return self::suggestion($hint);
            }
        }

        foreach ($keys as $key) {
            $hint = $this->usableHints($kind)
                ->whereRaw('categorization_hints.key % ?', [$key])
                ->whereRaw('similarity(categorization_hints.key, ?) >= '.self::MIN_SIMILARITY, [$key])
                ->orderByRaw('similarity(categorization_hints.key, ?) DESC', [$key])
                ->orderByDesc('categorization_hints.hits')
                ->orderByDesc('categorization_hints.last_used_at')
                ->first();

            if ($hint !== null) {
                return self::suggestion($hint);
            }
        }

        return null;
    }

    private function usableHints(CategoryKind $kind): Builder
    {
        return DB::table('categorization_hints')
            ->join('categories', 'categories.id', '=', 'categorization_hints.category_id')
            ->leftJoin('accounts', function (JoinClause $accounts): void {
                $accounts->on('accounts.id', '=', 'categorization_hints.account_id')
                    ->whereNull('accounts.archived_at')
                    ->whereNull('accounts.deleted_at');
            })
            ->where('categorization_hints.kind', $kind->value)
            ->whereNull('categories.archived_at')
            ->whereNotExists(function (Builder $parents): void {
                $parents->selectRaw('1')
                    ->from('categories', 'parents')
                    ->whereColumn('parents.id', 'categories.parent_id')
                    ->whereNotNull('parents.archived_at');
            })
            ->select([
                'categorization_hints.category_id',
                'accounts.id as account_id',
                'categorization_hints.hits',
            ]);
    }

    private static function suggestion(object $hint): CategorizationSuggestion
    {
        return new CategorizationSuggestion(
            categoryId: self::integer($hint->category_id ?? null) ?? 0,
            accountId: self::integer($hint->account_id ?? null),
            hits: self::integer($hint->hits ?? null) ?? 1,
        );
    }

    private static function integer(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }
}

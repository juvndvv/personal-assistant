<?php

declare(strict_types=1);

namespace App\Ai;

use App\Models\Account;
use App\Models\Category;

final readonly class ExtractionCatalog
{
    /**
     * @param  list<array{id: int, name: string, type: string}>  $accounts
     * @param  list<array{id: int, name: string, kind: string, parent: string|null}>  $categories
     */
    public function __construct(
        public array $accounts,
        public array $categories,
    ) {}

    public static function current(): self
    {
        $accounts = array_values(Account::query()
            ->active()
            ->ordered()
            ->get(['id', 'name', 'type'])
            ->map(fn (Account $account): array => [
                'id' => $account->id,
                'name' => $account->name,
                'type' => $account->type->value,
            ])
            ->all());

        $categories = array_values(Category::query()
            ->with('parent')
            ->whereNull('archived_at')
            ->orderBy('kind')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->reject(fn (Category $category): bool => $category->parent?->isArchived() === true)
            ->map(fn (Category $category): array => [
                'id' => $category->id,
                'name' => $category->name,
                'kind' => $category->kind->value,
                'parent' => $category->parent?->name,
            ])
            ->all());

        return new self($accounts, $categories);
    }

    /**
     * @return list<int>
     */
    public function accountIds(): array
    {
        return array_column($this->accounts, 'id');
    }

    public function categoryKind(int $categoryId): ?string
    {
        foreach ($this->categories as $category) {
            if ($category['id'] === $categoryId) {
                return $category['kind'];
            }
        }

        return null;
    }
}

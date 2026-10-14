<?php

declare(strict_types=1);

namespace App\Actions\Budgets;

use App\Domain\Budgets\EffectiveBudget;
use App\Domain\Period\PeriodResolver;
use App\Enums\CategoryKind;
use App\Models\Budget;
use App\Models\Category;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final readonly class SetBudget
{
    public function __construct(private PeriodResolver $periods) {}

    public function handle(int $categoryId, int $amountCents, ?string $effectiveFrom = null): EffectiveBudget
    {
        if ($amountCents < 0) {
            throw new InvalidArgumentException("A budget cannot be negative, got {$amountCents}.");
        }

        $label = $effectiveFrom ?? $this->periods->current()->label;

        if (! PeriodResolver::isValidLabel($label)) {
            throw new InvalidArgumentException("Invalid period label \"{$label}\".");
        }

        return DB::transaction(function () use ($categoryId, $amountCents, $label): EffectiveBudget {
            $category = $this->budgetableCategory($categoryId);

            Budget::query()->upsert(
                [['category_id' => $category->id, 'amount_cents' => $amountCents, 'effective_from' => $label]],
                ['category_id', 'effective_from'],
                ['amount_cents'],
            );

            $category->setRelation('parent', null);

            return new EffectiveBudget(
                category: $category,
                amountCents: $amountCents > 0 ? $amountCents : null,
                effectiveFrom: $amountCents > 0 ? $label : null,
            );
        });
    }

    private function budgetableCategory(int $categoryId): Category
    {
        $category = Category::query()->lockForUpdate()->find($categoryId)
            ?? throw ValidationException::withMessages(['category_id' => 'La categoría no existe.']);

        $error = match (true) {
            $category->kind !== CategoryKind::Expense => 'Solo las categorías de gasto pueden tener presupuesto.',
            ! $category->isTopLevel() => 'Solo las categorías principales pueden tener presupuesto.',
            $category->isArchived() => 'La categoría está archivada.',
            default => null,
        };

        if ($error !== null) {
            throw ValidationException::withMessages(['category_id' => $error]);
        }

        return $category;
    }
}

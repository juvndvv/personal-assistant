<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Reports\CategoryTotal;
use App\Reports\PeriodSummary;
use App\Reports\SubcategoryTotal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property PeriodSummary $resource
 */
final class PeriodSummaryResource extends JsonResource
{
    public function __construct(PeriodSummary $summary)
    {
        parent::__construct($summary);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $summary = $this->resource;

        return [
            'period' => (new PeriodResource($summary->period))->toArray($request),
            'income_cents' => $summary->incomeCents,
            'expense_cents' => $summary->expenseCents,
            'net_cents' => $summary->netCents(),
            'savings_rate_bp' => $summary->savingsRateBp(),
            'by_category' => [
                'expense' => array_map(self::category(...), $summary->expenseCategories),
                'income' => array_map(self::category(...), $summary->incomeCategories),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function category(CategoryTotal $total): array
    {
        return [
            'category_id' => $total->categoryId,
            'name' => $total->name,
            'amount_cents' => $total->amountCents,
            'share_bp' => $total->shareBp,
            'own_cents' => $total->ownCents,
            'children' => array_map(fn (SubcategoryTotal $child): array => [
                'category_id' => $child->categoryId,
                'name' => $child->name,
                'amount_cents' => $child->amountCents,
                'share_bp' => $child->shareBp,
            ], $total->children),
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Reports\BudgetComparison;
use App\Reports\BudgetVsActual;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property BudgetVsActual $resource
 */
final class BudgetVsActualResource extends JsonResource
{
    public function __construct(BudgetVsActual $report)
    {
        parent::__construct($report);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $report = $this->resource;

        return [
            'period' => (new PeriodResource($report->period))->toArray($request),
            'items' => array_map(fn (BudgetComparison $item): array => [
                'category' => (new CategorySummaryResource($item->category))->toArray($request),
                'budget_cents' => $item->budgetCents,
                'actual_cents' => $item->actualCents,
                'remaining_cents' => $item->remainingCents(),
                'used_bp' => $item->usedBp(),
                'status' => $item->status()->value,
            ], $report->items),
            'budgeted_cents' => $report->budgetedCents(),
            'actual_budgeted_cents' => $report->actualBudgetedCents(),
            'unbudgeted_actual_cents' => $report->unbudgetedActualCents(),
        ];
    }
}

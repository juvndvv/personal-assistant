<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Recurring\Forecast;
use App\Domain\Recurring\ForecastItem;
use App\Enums\RecurringType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Forecast $resource
 */
final class RecurringForecastResource extends JsonResource
{
    public function __construct(Forecast $forecast)
    {
        parent::__construct($forecast);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $forecast = $this->resource;

        return [
            'period' => (new PeriodResource($forecast->period))->toArray($request),
            'items' => array_map(fn (ForecastItem $item): array => [
                'template_id' => $item->templateId,
                'template_name' => $item->templateName,
                'type' => $item->type->value,
                'due_date' => $item->dueDate->toDateString(),
                'amount_cents' => $item->amountCents,
                'is_variable' => $item->isVariable,
                'status' => $item->status->value,
                'draft_id' => $item->draftId,
                'transaction_id' => $item->transactionId,
            ], $forecast->items),
            'pending_expense_cents' => $forecast->pendingCents(RecurringType::Expense),
            'pending_income_cents' => $forecast->pendingCents(RecurringType::Income),
            'posted_expense_cents' => $forecast->postedCents(RecurringType::Expense),
            'posted_income_cents' => $forecast->postedCents(RecurringType::Income),
        ];
    }
}

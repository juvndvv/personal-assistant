<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property RecurringTemplate $resource
 */
final class RecurringTemplateResource extends JsonResource
{
    public const array RELATIONS = ['account', 'category.parent'];

    public function __construct(RecurringTemplate $template)
    {
        parent::__construct($template);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $template = $this->resource;

        return [
            'id' => $template->id,
            'name' => $template->name,
            'type' => $template->type->value,
            'amount_cents' => $template->amount_cents,
            'is_variable' => $template->is_variable,
            'account' => new AccountSummaryResource($template->account),
            'category' => new CategorySummaryResource($template->category),
            'frequency' => $template->frequency->value,
            'day_of_month' => $template->day_of_month,
            'starts_on' => $template->starts_on->toDateString(),
            'ends_on' => $template->ends_on?->toDateString(),
            'description' => $template->description,
            'merchant' => $template->merchant,
            'note' => $template->note,
            'paused_at' => $template->paused_at?->toIso8601String(),
            'next_due_date' => $template->nextDueDate(CarbonImmutable::today())?->toDateString(),
            'created_at' => $template->created_at?->toIso8601String(),
        ];
    }
}

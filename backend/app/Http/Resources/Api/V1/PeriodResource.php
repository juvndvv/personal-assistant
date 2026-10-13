<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Period\Period;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Period $resource
 */
final class PeriodResource extends JsonResource
{
    public function __construct(Period $period)
    {
        parent::__construct($period);
    }

    /**
     * @return array{label: string, start: string, end: string, month_start_day: int}
     */
    public function toArray(Request $request): array
    {
        return [
            'label' => $this->resource->label,
            'start' => $this->resource->start->toDateString(),
            'end' => $this->resource->end->toDateString(),
            'month_start_day' => $this->resource->monthStartDay,
        ];
    }
}

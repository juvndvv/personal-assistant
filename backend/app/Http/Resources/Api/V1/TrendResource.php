<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Reports\TrendPoint;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property list<TrendPoint> $resource
 */
final class TrendResource extends JsonResource
{
    /**
     * @param  list<TrendPoint>  $points
     */
    public function __construct(array $points)
    {
        parent::__construct($points);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function toArray(Request $request): array
    {
        return array_map(function (TrendPoint $point) use ($request): array {
            $item = [
                'period' => (new PeriodResource($point->period))->toArray($request),
                'income_cents' => $point->incomeCents,
                'expense_cents' => $point->expenseCents,
                'savings_rate_bp' => $point->savingsRateBp(),
            ];

            if ($point->categoryCents !== null) {
                $item['category_cents'] = $point->categoryCents;
            }

            return $item;
        }, $this->resource);
    }
}

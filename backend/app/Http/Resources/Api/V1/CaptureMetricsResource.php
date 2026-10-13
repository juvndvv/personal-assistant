<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Reports\CaptureMetrics;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property CaptureMetrics $resource
 */
final class CaptureMetricsResource extends JsonResource
{
    private const int DAYS_PER_WEEK = 7;

    private const int MILLISECONDS_PER_SECOND = 1_000;

    public function __construct(CaptureMetrics $metrics)
    {
        parent::__construct($metrics);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $metrics = $this->resource;

        return [
            'period' => (new PeriodResource($metrics->period))->toArray($request),
            'captures_confirmed' => $metrics->capturesConfirmed,
            'median_seconds_to_confirm' => self::seconds($metrics->medianMillisecondsToConfirm),
            'p90_seconds_to_confirm' => self::seconds($metrics->p90MillisecondsToConfirm),
            'unedited_share_bp' => $metrics->uneditedShareBp(),
            'active_days' => $metrics->activeDays,
            'elapsed_days' => $metrics->elapsedDays,
            'active_days_per_week' => $metrics->elapsedDays === 0
                ? null
                : round($metrics->activeDays * self::DAYS_PER_WEEK / $metrics->elapsedDays, 1),
        ];
    }

    private static function seconds(?int $milliseconds): ?float
    {
        return $milliseconds === null ? null : round($milliseconds / self::MILLISECONDS_PER_SECOND, 1);
    }
}

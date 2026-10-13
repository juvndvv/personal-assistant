<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Period\PeriodResolver;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Setting $resource
 */
final class SettingsResource extends JsonResource
{
    public function __construct(Setting $settings)
    {
        parent::__construct($settings);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $settings = $this->resource;

        return [
            'month_start_day' => $settings->month_start_day,
            'default_account_id' => $settings->default_account_id,
            'last_used_account_id' => $settings->last_used_account_id,
            'orphan_draft_ttl_days' => $settings->orphan_draft_ttl_days,
            'current_period' => new PeriodResource((new PeriodResolver($settings->month_start_day))->current()),
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Reports\NetWorth;
use App\Reports\NetWorthAccount;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property NetWorth $resource
 */
final class NetWorthResource extends JsonResource
{
    public function __construct(NetWorth $netWorth)
    {
        parent::__construct($netWorth);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $netWorth = $this->resource;

        return [
            'date' => $netWorth->date->toDateString(),
            'total_cents' => $netWorth->totalCents(),
            'assets_cents' => $netWorth->assetsCents(),
            'liabilities_cents' => $netWorth->liabilitiesCents(),
            'accounts' => array_map(fn (NetWorthAccount $entry): array => [
                'id' => $entry->account->id,
                'name' => $entry->account->name,
                'type' => $entry->account->type->value,
                'archived' => $entry->account->isArchived(),
                'balance_cents' => $entry->balanceCents,
                'last_updated_on' => $entry->lastUpdatedOn->toDateString(),
                'stale' => $entry->stale,
            ], $netWorth->accounts),
        ];
    }
}

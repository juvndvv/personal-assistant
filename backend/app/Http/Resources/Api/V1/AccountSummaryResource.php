<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Account;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Account $resource
 */
final class AccountSummaryResource extends JsonResource
{
    public function __construct(Account $account)
    {
        parent::__construct($account);
    }

    /**
     * @return array{id: int, name: string, type: string, archived: bool}
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'name' => $this->resource->name,
            'type' => $this->resource->type->value,
            'archived' => $this->resource->isArchived(),
        ];
    }
}

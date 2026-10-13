<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Tag;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Tag $resource
 */
final class TagResource extends JsonResource
{
    public function __construct(Tag $tag, private readonly ?int $usageCount = null)
    {
        parent::__construct($tag);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->id,
            'name' => $this->resource->name,
            ...($this->usageCount === null ? [] : ['usage_count' => $this->usageCount]),
        ];
    }
}

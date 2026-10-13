<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Draft;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use stdClass;

/**
 * @property Draft $resource
 */
final class DraftResource extends JsonResource
{
    public const array RELATIONS = ['capture.attachments'];

    public function __construct(Draft $draft)
    {
        parent::__construct($draft);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $draft = $this->resource;

        return [
            'id' => $draft->id,
            'origin' => $draft->origin->value,
            'status' => $draft->status->value,
            'proposal' => $draft->proposal(),
            'confidence' => $draft->confidence === [] ? new stdClass : $draft->confidence,
            'field_sources' => $draft->field_sources === [] ? new stdClass : $draft->field_sources,
            'low_confidence_fields' => $draft->low_confidence_fields,
            'capture' => $draft->capture === null ? null : new CaptureResource($draft->capture),
            'recurring' => null,
            'transaction_id' => $draft->transaction_id,
            'transfer_id' => $draft->transfer_id,
            'corrected_fields' => $draft->corrected_fields,
            'confirmed_at' => $draft->confirmed_at?->toIso8601String(),
            'discarded_at' => $draft->discarded_at?->toIso8601String(),
            'created_at' => $draft->created_at?->toIso8601String(),
        ];
    }
}

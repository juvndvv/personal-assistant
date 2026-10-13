<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Attachment;
use App\Models\Capture;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Capture $resource
 */
final class CaptureResource extends JsonResource
{
    public function __construct(Capture $capture)
    {
        parent::__construct($capture);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $capture = $this->resource;

        return [
            'id' => $capture->id,
            'kind' => $capture->kind->value,
            'status' => $capture->status->value,
            'transcript' => $capture->transcript,
            'error' => $capture->error,
            'transcription_ms' => $capture->transcription_ms,
            'extraction_ms' => $capture->extraction_ms,
            'attachments' => $capture->attachments
                ->sortBy('created_at')
                ->map(fn (Attachment $attachment): AttachmentResource => new AttachmentResource($attachment))
                ->values()
                ->all(),
            'created_at' => $capture->created_at?->toIso8601String(),
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Attachment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Attachment $resource
 */
final class AttachmentResource extends JsonResource
{
    public function __construct(Attachment $attachment)
    {
        parent::__construct($attachment);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $attachment = $this->resource;
        $url = route('attachments.show', ['attachment' => $attachment->id], absolute: false);

        return [
            'id' => $attachment->id,
            'kind' => $attachment->kind->value,
            'mime' => $attachment->mime,
            'size_bytes' => $attachment->size_bytes,
            'original_name' => $attachment->original_name,
            'url' => $url,
            'download_url' => $url.'?download=1',
            'created_at' => $attachment->created_at?->toIso8601String(),
        ];
    }
}

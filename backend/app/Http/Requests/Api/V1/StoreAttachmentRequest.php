<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\AttachmentKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use LogicException;

final class StoreAttachmentRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'file' => ReceiptFileRules::forKind(null),
        ];
    }

    public function upload(): UploadedFile
    {
        $file = $this->file('file');

        return $file instanceof UploadedFile ? $file : throw new LogicException('The validated upload is missing.');
    }

    /**
     * @return array{AttachmentKind, string}
     */
    public function kindAndMime(): array
    {
        return ReceiptFileRules::resolve($this->upload(), null)
            ?? throw new LogicException('The validated upload has no supported MIME type.');
    }
}

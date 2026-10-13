<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CaptureKind;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;
use LogicException;

final class StoreCaptureRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $kind = CaptureKind::tryFrom($this->string('kind')->toString());

        return [
            'kind' => ['required', Rule::enum(CaptureKind::class)],
            'file' => ReceiptFileRules::forKind($kind?->attachmentKind()),
            'client_started_at' => ['sometimes', 'nullable', 'date'],
        ];
    }

    public function kind(): CaptureKind
    {
        return CaptureKind::from($this->string('kind')->toString());
    }

    public function upload(): UploadedFile
    {
        $file = $this->file('file');

        return $file instanceof UploadedFile ? $file : throw new LogicException('The validated upload is missing.');
    }

    public function mime(): string
    {
        return ReceiptFileRules::resolve($this->upload(), $this->kind()->attachmentKind())[1]
            ?? throw new LogicException('The validated upload has no supported MIME type.');
    }

    public function clientStartedAt(): ?CarbonImmutable
    {
        return $this->filled('client_started_at')
            ? CarbonImmutable::parse($this->string('client_started_at')->toString())->setTimezone(config()->string('app.timezone'))
            : null;
    }
}

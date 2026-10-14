<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CsvDelimiter;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ExportArchiveRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'include_receipts' => ['sometimes', 'boolean'],
            'delimiter' => ['sometimes', Rule::enum(CsvDelimiter::class)],
        ];
    }

    public function includeReceipts(): bool
    {
        return $this->boolean('include_receipts');
    }

    public function delimiter(): CsvDelimiter
    {
        return CsvDelimiter::tryFrom($this->string('delimiter')->toString()) ?? CsvDelimiter::Semicolon;
    }
}

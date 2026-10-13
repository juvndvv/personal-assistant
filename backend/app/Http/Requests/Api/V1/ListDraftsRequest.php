<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\DraftOrigin;
use App\Enums\DraftStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ListDraftsRequest extends FormRequest
{
    public const int DEFAULT_PER_PAGE = 50;

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(DraftStatus::class)],
            'origin' => ['sometimes', 'array'],
            'origin.*' => [Rule::enum(DraftOrigin::class)],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function status(): DraftStatus
    {
        return DraftStatus::tryFrom($this->string('status')->toString()) ?? DraftStatus::Pending;
    }

    /**
     * @return list<string>
     */
    public function origins(): array
    {
        $origins = $this->input('origin', []);

        return is_array($origins) ? array_values(array_filter($origins, is_string(...))) : [];
    }

    public function perPage(): int
    {
        return $this->filled('per_page') ? $this->integer('per_page') : self::DEFAULT_PER_PAGE;
    }
}

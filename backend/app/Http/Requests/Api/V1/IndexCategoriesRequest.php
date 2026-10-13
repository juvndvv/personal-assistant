<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CategoryKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class IndexCategoriesRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'kind' => ['sometimes', Rule::enum(CategoryKind::class)],
            'include_archived' => ['sometimes', 'boolean'],
        ];
    }

    public function kind(): ?CategoryKind
    {
        $kind = $this->query('kind');

        return is_string($kind) ? CategoryKind::tryFrom($kind) : null;
    }

    public function includeArchived(): bool
    {
        return $this->boolean('include_archived');
    }
}

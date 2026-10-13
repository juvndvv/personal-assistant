<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CategoryKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreCategoryRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $kind = $this->input('kind');
        $parentId = $this->input('parent_id');

        return [
            'kind' => ['required', Rule::enum(CategoryKind::class)],
            'name' => [
                'required', 'string', 'min:1', 'max:60',
                CategoryRules::uniqueName(is_string($kind) ? $kind : '', is_numeric($parentId) ? (int) $parentId : null),
            ],
            'parent_id' => ['sometimes', 'nullable', 'integer'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40'],
            'color' => CategoryRules::color(),
            'sort_order' => ['sometimes', 'integer', 'between:0,1000000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }
}

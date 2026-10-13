<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\Category;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class UpdateCategoryRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $category = $this->category();
        $parentId = $this->has('parent_id') ? $this->input('parent_id') : $category->parent_id;

        return [
            'kind' => ['sometimes', Rule::in([$category->kind->value])],
            'name' => [
                'sometimes', 'required', 'string', 'min:1', 'max:60',
                CategoryRules::uniqueName($category->kind->value, is_numeric($parentId) ? (int) $parentId : null, $category->id),
            ],
            'parent_id' => ['sometimes', 'nullable', 'integer'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:40'],
            'color' => CategoryRules::color(),
            'sort_order' => ['sometimes', 'integer', 'between:0,1000000'],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->has('name') || ! $this->has('parent_id') || $validator->errors()->has('parent_id')) {
                    return;
                }

                $category = $this->category();
                $parentId = $this->input('parent_id');

                CategoryRules::uniqueName(
                    $category->kind->value,
                    is_numeric($parentId) ? (int) $parentId : null,
                    $category->id,
                )('parent_id', $category->name, fn (string $message) => $validator->errors()->add('parent_id', $message));
            },
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'kind.in' => 'El tipo de una categoría no se puede cambiar.',
        ];
    }

    public function category(): Category
    {
        $category = $this->route('category');

        abort_unless($category instanceof Category, 404);

        return $category;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }
}

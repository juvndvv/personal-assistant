<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\CategoryKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CategorizationSuggestionRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::enum(CategoryKind::class)],
            'merchant' => ['sometimes', 'nullable', 'string', 'max:120', MovementInputRules::validUtf8()],
            'description' => ['sometimes', 'nullable', 'string', 'max:255', MovementInputRules::validUtf8()],
        ];
    }

    public function kind(): CategoryKind
    {
        return CategoryKind::from($this->string('type')->toString());
    }

    public function merchant(): ?string
    {
        return MovementInputRules::text($this->query('merchant'));
    }

    public function description(): ?string
    {
        return MovementInputRules::text($this->query('description'));
    }
}

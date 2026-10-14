<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Tags\TagName;
use Illuminate\Foundation\Http\FormRequest;

final class TagNameRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', ...MovementInputRules::tagName()],
        ];
    }

    public function tagName(): string
    {
        return TagName::normalize($this->string('name')->toString());
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => TagName::normalize($this->input('name'))]);
        }
    }
}

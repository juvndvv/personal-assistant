<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

final class IndexTagsRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'q' => ['sometimes', 'nullable', 'string', 'max:40', MovementInputRules::validUtf8()],
        ];
    }

    public function search(): ?string
    {
        return MovementInputRules::text($this->query('q'));
    }
}

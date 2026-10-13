<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

final class IndexRecurringTemplatesRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'include_paused' => ['sometimes', 'boolean'],
        ];
    }

    public function includePaused(): bool
    {
        return $this->boolean('include_paused');
    }
}

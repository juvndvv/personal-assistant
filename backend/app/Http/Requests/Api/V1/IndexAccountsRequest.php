<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

final class IndexAccountsRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'include_archived' => ['sometimes', 'boolean'],
        ];
    }

    public function includeArchived(): bool
    {
        return $this->boolean('include_archived');
    }
}

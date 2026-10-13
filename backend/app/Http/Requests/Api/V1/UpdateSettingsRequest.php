<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

final class UpdateSettingsRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'month_start_day' => ['sometimes', 'required', 'integer', 'between:1,28'],
            'default_account_id' => ['sometimes', 'nullable', 'integer'],
            'orphan_draft_ttl_days' => ['sometimes', 'required', 'integer', 'between:1,90'],
        ];
    }
}

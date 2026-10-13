<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

final class CurrentPeriodRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'month_start_day' => ['sometimes', 'integer', 'between:1,28'],
        ];
    }

    public function previewStartDay(): ?int
    {
        return $this->has('month_start_day') ? $this->integer('month_start_day') : null;
    }
}

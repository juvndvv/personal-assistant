<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

final class ResolvePeriodRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d'],
        ];
    }

    public function resolvedDate(): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $this->string('date')->toString())
            ?: CarbonImmutable::today();
    }
}

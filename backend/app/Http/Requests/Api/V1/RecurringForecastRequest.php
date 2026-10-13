<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Period\Period;
use App\Domain\Period\PeriodResolver;
use Illuminate\Foundation\Http\FormRequest;

final class RecurringForecastRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'period' => ['sometimes', 'string', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ];
    }

    public function period(PeriodResolver $resolver): Period
    {
        $label = $this->query('period');

        return is_string($label) ? $resolver->fromLabel($label) : $resolver->current();
    }
}

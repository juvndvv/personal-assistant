<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Period\Period;
use App\Domain\Period\PeriodResolver;
use App\Rules\PeriodLabel;
use Illuminate\Foundation\Http\FormRequest;

final class ReportPeriodRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'period' => ['sometimes', 'string', new PeriodLabel],
        ];
    }

    public function period(PeriodResolver $resolver): Period
    {
        $label = $this->query('period');

        return is_string($label) ? $resolver->fromLabel($label) : $resolver->current();
    }
}

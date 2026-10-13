<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Period\Period;
use App\Domain\Period\PeriodResolver;
use App\Rules\PeriodLabel;
use Illuminate\Foundation\Http\FormRequest;

final class TrendReportRequest extends FormRequest
{
    public const int DEFAULT_PERIODS = 12;

    public const int MAX_PERIODS = 24;

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'periods' => ['sometimes', 'integer', 'between:1,'.self::MAX_PERIODS],
            'until' => ['sometimes', 'string', new PeriodLabel],
            'category_id' => ['sometimes', 'integer', 'exists:categories,id'],
        ];
    }

    /**
     * @return list<Period>
     */
    public function periods(PeriodResolver $resolver): array
    {
        $until = $this->query('until');
        $count = $this->has('periods') ? $this->integer('periods') : self::DEFAULT_PERIODS;

        return $resolver->lastN($count, is_string($until) ? $resolver->fromLabel($until) : null);
    }

    public function categoryId(): ?int
    {
        return $this->has('category_id') ? $this->integer('category_id') : null;
    }
}

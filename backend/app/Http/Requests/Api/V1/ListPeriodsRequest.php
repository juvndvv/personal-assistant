<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Rules\PeriodLabel;
use Illuminate\Foundation\Http\FormRequest;

final class ListPeriodsRequest extends FormRequest
{
    public const int DEFAULT_COUNT = 12;

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'count' => ['sometimes', 'integer', 'between:1,36'],
            'until' => ['sometimes', 'string', new PeriodLabel],
        ];
    }

    public function count(): int
    {
        return $this->has('count') ? $this->integer('count') : self::DEFAULT_COUNT;
    }

    public function until(): ?string
    {
        $until = $this->query('until');

        return is_string($until) ? $until : null;
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

final class SettlementSuggestionRequest extends FormRequest
{
    /**
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'date' => ['sometimes', 'date_format:Y-m-d'],
        ];
    }

    public function suggestionDate(): CarbonImmutable
    {
        return MovementInputRules::parseDate($this->query('date')) ?? CarbonImmutable::today();
    }
}

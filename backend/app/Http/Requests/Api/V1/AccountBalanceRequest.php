<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

final class AccountBalanceRequest extends FormRequest
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

    public function balanceDate(): CarbonImmutable
    {
        $date = $this->query('date');

        return is_string($date)
            ? CarbonImmutable::createFromFormat('!Y-m-d', $date) ?: CarbonImmutable::today()
            : CarbonImmutable::today();
    }
}

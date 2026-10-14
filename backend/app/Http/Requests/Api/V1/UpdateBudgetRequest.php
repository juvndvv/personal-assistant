<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Ledger\MovementRules;
use App\Rules\PeriodLabel;
use Illuminate\Foundation\Http\FormRequest;

final class UpdateBudgetRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'amount_cents' => ['required', 'integer', 'between:0,'.MovementRules::MAX_MAGNITUDE_CENTS],
            'effective_from' => ['sometimes', 'string', new PeriodLabel],
        ];
    }

    public function amountCents(): int
    {
        return $this->integer('amount_cents');
    }

    public function effectiveFrom(): ?string
    {
        $label = $this->input('effective_from');

        return is_string($label) ? $label : null;
    }
}

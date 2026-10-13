<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\AccountType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreAccountRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $isCard = fn (): bool => $this->input('type') === AccountType::CreditCard->value;

        return [
            'name' => ['required', 'string', 'min:1', 'max:80', AccountRules::uniqueName()],
            'type' => AccountRules::type(required: true),
            'opening_balance_cents' => AccountRules::signedCents(required: false),
            'opening_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'statement_day' => [Rule::prohibitedIf(fn (): bool => ! $isCard()), 'nullable', 'integer', 'between:1,28'],
            'settlement_account_id' => [Rule::prohibitedIf(fn (): bool => ! $isCard()), 'nullable', 'integer', AccountRules::settlementAccount()],
            'sort_order' => ['sometimes', 'integer', 'between:0,1000000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }
}

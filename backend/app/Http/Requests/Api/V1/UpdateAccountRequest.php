<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\AccountType;
use App\Models\Account;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateAccountRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $account = $this->account();
        $isCard = fn (): bool => $this->input('type', $account->type->value) === AccountType::CreditCard->value;

        return [
            'name' => ['sometimes', 'required', 'string', 'min:1', 'max:80', AccountRules::uniqueName($account->id)],
            'type' => AccountRules::type(required: false),
            'opening_balance_cents' => AccountRules::signedCents(required: false),
            'opening_date' => ['sometimes', 'required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'statement_day' => [Rule::prohibitedIf(fn (): bool => ! $isCard()), 'nullable', 'integer', 'between:1,28'],
            'settlement_account_id' => [Rule::prohibitedIf(fn (): bool => ! $isCard()), 'nullable', 'integer', AccountRules::settlementAccount($account->id)],
            'sort_order' => ['sometimes', 'integer', 'between:0,1000000'],
        ];
    }

    public function account(): Account
    {
        $account = $this->route('account');

        abort_unless($account instanceof Account, 404);

        return $account;
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('name'))) {
            $this->merge(['name' => trim($this->input('name'))]);
        }
    }
}

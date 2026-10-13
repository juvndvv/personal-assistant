<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Transactions\Changes;
use App\Enums\TransactionType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateTransactionRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'type' => ['sometimes', Rule::in([TransactionType::Expense->value, TransactionType::Income->value])],
            'amount_cents' => MovementInputRules::magnitudeCents(required: false),
            'date' => MovementInputRules::date(nullable: false),
            'account_id' => ['sometimes', 'integer'],
            'category_id' => ['sometimes', 'integer'],
            ...MovementInputRules::texts(),
            ...MovementInputRules::tags(),
            'target_balance_cents' => AccountRules::signedCents(required: false),
        ];
    }

    public function changes(): Changes
    {
        return new Changes($this->validated());
    }

    protected function prepareForValidation(): void
    {
        $this->merge(MovementInputRules::normalizeTags($this->all()));
    }
}

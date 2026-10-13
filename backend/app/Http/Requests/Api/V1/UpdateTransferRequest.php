<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Transactions\Changes;
use App\Enums\TransferKind;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class UpdateTransferRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'kind' => ['sometimes', Rule::enum(TransferKind::class)],
            'from_account_id' => ['sometimes', 'integer'],
            'to_account_id' => ['sometimes', 'integer'],
            'amount_cents' => MovementInputRules::magnitudeCents(required: false),
            'date' => MovementInputRules::date(nullable: false),
            'note' => ['sometimes', 'nullable', 'string', 'max:1000', MovementInputRules::validUtf8()],
        ];
    }

    public function changes(): Changes
    {
        return new Changes($this->validated());
    }
}

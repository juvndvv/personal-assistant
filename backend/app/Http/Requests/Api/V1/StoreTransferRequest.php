<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\TransferKind;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreTransferRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'kind' => ['sometimes', Rule::enum(TransferKind::class)],
            'from_account_id' => ['required', 'integer'],
            'to_account_id' => ['required', 'integer', 'different:from_account_id'],
            'amount_cents' => MovementInputRules::magnitudeCents(required: true),
            'date' => MovementInputRules::date(),
            'note' => ['sometimes', 'nullable', 'string', 'max:1000', MovementInputRules::validUtf8()],
            'draft_id' => MovementInputRules::draftId(),
        ];
    }

    public function kind(): TransferKind
    {
        return TransferKind::tryFrom($this->string('kind')->toString()) ?? TransferKind::Transfer;
    }

    public function fromAccountId(): int
    {
        return $this->integer('from_account_id');
    }

    public function toAccountId(): int
    {
        return $this->integer('to_account_id');
    }

    public function amountCents(): int
    {
        return $this->integer('amount_cents');
    }

    public function draftId(): ?int
    {
        return $this->filled('draft_id') ? $this->integer('draft_id') : null;
    }

    public function movementDate(): ?CarbonImmutable
    {
        return MovementInputRules::parseDate($this->input('date'));
    }

    public function note(): ?string
    {
        return MovementInputRules::text($this->input('note'));
    }
}

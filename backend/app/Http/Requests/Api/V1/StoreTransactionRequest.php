<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Enums\TransactionType;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StoreTransactionRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in([TransactionType::Expense->value, TransactionType::Income->value])],
            'amount_cents' => MovementInputRules::magnitudeCents(required: true),
            'date' => MovementInputRules::date(),
            'account_id' => ['sometimes', 'nullable', 'integer'],
            'category_id' => ['required', 'integer'],
            ...MovementInputRules::texts(),
            ...MovementInputRules::tags(),
            'draft_id' => MovementInputRules::draftId(),
        ];
    }

    public function type(): TransactionType
    {
        return TransactionType::from($this->string('type')->toString());
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

    public function accountId(): ?int
    {
        return $this->filled('account_id') ? $this->integer('account_id') : null;
    }

    public function categoryId(): int
    {
        return $this->integer('category_id');
    }

    public function text(string $field): ?string
    {
        return MovementInputRules::text($this->input($field));
    }

    /**
     * @return list<string>
     */
    public function tags(): array
    {
        $tags = $this->input('tags', []);

        return is_array($tags) ? array_values(array_filter($tags, is_string(...))) : [];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(MovementInputRules::normalizeTags($this->all()));
    }
}

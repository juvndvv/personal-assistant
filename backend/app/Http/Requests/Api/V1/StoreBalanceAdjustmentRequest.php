<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

final class StoreBalanceAdjustmentRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d'],
            'target_balance_cents' => AccountRules::signedCents(required: true),
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    public function adjustmentDate(): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $this->string('date')->toString())
            ?: CarbonImmutable::today();
    }

    public function targetBalanceCents(): int
    {
        return $this->integer('target_balance_cents');
    }

    public function note(): ?string
    {
        $note = $this->input('note');

        return is_string($note) && trim($note) !== '' ? trim($note) : null;
    }
}

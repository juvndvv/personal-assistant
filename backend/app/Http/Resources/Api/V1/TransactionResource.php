<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Models\Tag;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Transaction $resource
 */
final class TransactionResource extends JsonResource
{
    public function __construct(Transaction $transaction)
    {
        parent::__construct($transaction);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $transaction = $this->resource;

        return [
            'id' => $transaction->id,
            'type' => $transaction->type->value,
            'account' => new AccountSummaryResource($transaction->account),
            'amount_cents' => $transaction->magnitudeCents(),
            'signed_amount_cents' => $transaction->amount_cents,
            'date' => $transaction->date->toDateString(),
            'category' => $transaction->category === null ? null : new CategorySummaryResource($transaction->category),
            'description' => $transaction->description,
            'merchant' => $transaction->merchant,
            'note' => $transaction->note,
            'origin' => $transaction->origin->value,
            'tags' => $transaction->tags->map(fn (Tag $tag): array => ['id' => $tag->id, 'name' => $tag->name])->all(),
            'transfer' => $this->transfer(),
            'adjustment_target_cents' => $transaction->adjustment_target_cents,
            'recurring_template_id' => null,
            'attachments_count' => 0,
            'created_at' => $transaction->created_at?->toIso8601String(),
            'updated_at' => $transaction->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function transfer(): ?array
    {
        $transaction = $this->resource;
        $transfer = $transaction->transfer;

        if ($transfer === null || $transaction->transfer_leg === null) {
            return null;
        }

        $counterAccount = $transaction->account_id === $transfer->from_account_id
            ? $transfer->toAccount
            : $transfer->fromAccount;

        return [
            'id' => $transfer->id,
            'kind' => $transfer->kind->value,
            'leg' => $transaction->transfer_leg->value,
            'counter_account' => $counterAccount === null ? null : new AccountSummaryResource($counterAccount),
        ];
    }
}

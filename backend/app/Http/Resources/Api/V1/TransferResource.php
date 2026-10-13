<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Enums\TransactionOrigin;
use App\Enums\TransferLeg;
use App\Models\Transaction;
use App\Models\Transfer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @property Transfer $resource
 */
final class TransferResource extends JsonResource
{
    public const array RELATIONS = ['fromAccount', 'toAccount', 'legs'];

    public function __construct(Transfer $transfer)
    {
        parent::__construct($transfer);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $transfer = $this->resource;
        $out = $this->leg(TransferLeg::Out);
        $in = $this->leg(TransferLeg::In);

        return [
            'id' => $transfer->id,
            'kind' => $transfer->kind->value,
            'from_account' => new AccountSummaryResource($transfer->fromAccount),
            'to_account' => new AccountSummaryResource($transfer->toAccount),
            'amount_cents' => $transfer->amount_cents,
            'date' => $transfer->date->toDateString(),
            'note' => $transfer->note,
            'origin' => ($out ?? $in)?->origin->value ?? TransactionOrigin::Manual->value,
            'out_transaction_id' => $out?->id,
            'in_transaction_id' => $in?->id,
            'created_at' => $transfer->created_at?->toIso8601String(),
        ];
    }

    private function leg(TransferLeg $leg): ?Transaction
    {
        return $this->resource->legs->first(fn (Transaction $transaction): bool => $transaction->transfer_leg === $leg);
    }
}

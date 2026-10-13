<?php

declare(strict_types=1);

namespace App\Actions\Transfers;

use App\Enums\TransactionOrigin;
use App\Enums\TransferKind;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Closure;

final readonly class SettleCreditCard
{
    public function __construct(private RegisterTransfer $registerTransfer) {}

    /**
     * @param  (Closure(Transfer): void)|null  $withinTransaction
     */
    public function handle(
        int $cardAccountId,
        int $fromAccountId,
        int $amountCents,
        ?CarbonImmutable $date = null,
        ?string $note = null,
        TransactionOrigin $origin = TransactionOrigin::Manual,
        ?Closure $withinTransaction = null,
    ): Transfer {
        return $this->registerTransfer->handle(
            fromAccountId: $fromAccountId,
            toAccountId: $cardAccountId,
            amountCents: $amountCents,
            date: $date,
            kind: TransferKind::CardSettlement,
            note: $note,
            origin: $origin,
            withinTransaction: $withinTransaction,
        );
    }
}

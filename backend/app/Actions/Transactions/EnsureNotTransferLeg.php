<?php

declare(strict_types=1);

namespace App\Actions\Transactions;

use App\Enums\TransactionType;
use App\Exceptions\DomainConflict;
use App\Models\Transaction;

final class EnsureNotTransferLeg
{
    public function handle(Transaction $transaction): void
    {
        if ($transaction->type === TransactionType::Transfer || $transaction->transfer_id !== null) {
            throw new DomainConflict(
                'transfer_leg_immutable',
                'Este movimiento forma parte de una transferencia; modifícala desde la transferencia.',
            );
        }
    }
}

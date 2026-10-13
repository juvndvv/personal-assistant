<?php

declare(strict_types=1);

namespace App\Actions\Transactions;

use App\Domain\Ledger\MovementRules;
use App\Models\Account;
use App\Models\Transaction;
use Illuminate\Support\Facades\DB;

final readonly class RestoreTransaction
{
    public function __construct(
        private EnsureNotTransferLeg $ensureNotTransferLeg,
        private MovementRules $rules,
    ) {}

    public function handle(Transaction $transaction): Transaction
    {
        $this->ensureNotTransferLeg->handle($transaction);

        return DB::transaction(function () use ($transaction): Transaction {
            $transaction = Transaction::query()->withTrashed()->lockForUpdate()->findOrFail($transaction->id);

            if (! $transaction->trashed()) {
                return $transaction;
            }

            $this->rules->ensureWritable(Account::query()->withTrashed()->findOrFail($transaction->account_id));

            $transaction->restore();

            return $transaction;
        });
    }
}

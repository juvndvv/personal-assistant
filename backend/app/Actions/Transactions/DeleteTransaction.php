<?php

declare(strict_types=1);

namespace App\Actions\Transactions;

use App\Models\Transaction;
use Illuminate\Support\Facades\DB;

final readonly class DeleteTransaction
{
    public function __construct(private EnsureNotTransferLeg $ensureNotTransferLeg) {}

    public function handle(Transaction $transaction): void
    {
        $this->ensureNotTransferLeg->handle($transaction);

        DB::transaction(function () use ($transaction): void {
            Transaction::query()->lockForUpdate()->findOrFail($transaction->id)->delete();
        });
    }
}

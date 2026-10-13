<?php

declare(strict_types=1);

namespace App\Actions\Transfers;

use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class DeleteTransfer
{
    public function handle(Transfer $transfer): void
    {
        DB::transaction(function () use ($transfer): void {
            $transfer = Transfer::query()->lockForUpdate()->findOrFail($transfer->id);
            $now = CarbonImmutable::now();

            Transaction::query()
                ->where('transfer_id', $transfer->id)
                ->update(['deleted_at' => $now, 'updated_at' => $now]);

            $transfer->delete();
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Transfers;

use App\Domain\Ledger\MovementRules;
use App\Models\Account;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class RestoreTransfer
{
    public function __construct(private MovementRules $rules) {}

    public function handle(Transfer $transfer): Transfer
    {
        return DB::transaction(function () use ($transfer): Transfer {
            $transfer = Transfer::query()->withTrashed()->lockForUpdate()->findOrFail($transfer->id);

            if (! $transfer->trashed()) {
                return $transfer;
            }

            $this->rules->ensureWritable(Account::query()->withTrashed()->findOrFail($transfer->from_account_id), 'from_account_id');
            $this->rules->ensureWritable(Account::query()->withTrashed()->findOrFail($transfer->to_account_id), 'to_account_id');

            $transfer->restore();

            Transaction::query()
                ->onlyTrashed()
                ->where('transfer_id', $transfer->id)
                ->update(['deleted_at' => null, 'updated_at' => CarbonImmutable::now()]);

            return $transfer;
        });
    }
}

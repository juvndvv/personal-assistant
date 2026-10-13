<?php

declare(strict_types=1);

namespace App\Actions\Transfers;

use App\Domain\Transactions\Changes;
use App\Enums\TransferKind;
use App\Enums\TransferLeg;
use App\Models\Transaction;
use App\Models\Transfer;
use Illuminate\Support\Facades\DB;

final readonly class UpdateTransfer
{
    public function __construct(private TransferAccounts $transferAccounts) {}

    public function handle(Transfer $transfer, Changes $changes): Transfer
    {
        return DB::transaction(function () use ($transfer, $changes): Transfer {
            $transfer = Transfer::query()->lockForUpdate()->findOrFail($transfer->id);

            $kind = $changes->has('kind')
                ? TransferKind::tryFrom((string) $changes->text('kind')) ?? $transfer->kind
                : $transfer->kind;
            $fromAccountId = $changes->integer('from_account_id') ?? $transfer->from_account_id;
            $toAccountId = $changes->integer('to_account_id') ?? $transfer->to_account_id;
            $date = $changes->date('date') ?? $transfer->date;

            [$from, $to] = $this->transferAccounts->handle(
                $kind,
                $fromAccountId,
                $toAccountId,
                $date,
                fromMustBeWritable: $fromAccountId !== $transfer->from_account_id,
                toMustBeWritable: $toAccountId !== $transfer->to_account_id,
            );

            $transfer->kind = $kind;
            $transfer->from_account_id = $from->id;
            $transfer->to_account_id = $to->id;
            $transfer->amount_cents = $changes->integer('amount_cents') ?? $transfer->amount_cents;
            $transfer->date = $date;

            if ($changes->has('note')) {
                $transfer->note = $changes->text('note');
            }

            $transfer->save();

            $legs = Transaction::query()->where('transfer_id', $transfer->id)->lockForUpdate()->get();

            foreach ($legs as $leg) {
                $isOut = $leg->transfer_leg === TransferLeg::Out;
                $leg->account_id = $isOut ? $from->id : $to->id;
                $leg->amount_cents = $isOut ? -$transfer->amount_cents : $transfer->amount_cents;
                $leg->date = $transfer->date;
                $leg->note = $transfer->note;
                $leg->save();
            }

            $transfer->setRelation('fromAccount', $from);
            $transfer->setRelation('toAccount', $to);
            $transfer->setRelation('legs', $legs);

            return $transfer;
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Transfers;

use App\Actions\Drafts\ConfirmDraft;
use App\Domain\Ledger\MovementRules;
use App\Enums\DraftOrigin;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Enums\TransferKind;
use App\Enums\TransferLeg;
use App\Models\Account;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final readonly class RegisterTransfer
{
    public function __construct(
        private TransferAccounts $transferAccounts,
        private ConfirmDraft $confirmDraft,
    ) {}

    /**
     * @param  (Closure(Transfer): void)|null  $withinTransaction
     */
    public function handle(
        int $fromAccountId,
        int $toAccountId,
        int $amountCents,
        ?CarbonImmutable $date = null,
        TransferKind $kind = TransferKind::Transfer,
        ?string $note = null,
        TransactionOrigin $origin = TransactionOrigin::Manual,
        ?Closure $withinTransaction = null,
        ?int $draftId = null,
    ): Transfer {
        if ($amountCents < 1 || $amountCents > MovementRules::MAX_MAGNITUDE_CENTS) {
            throw ValidationException::withMessages(['amount_cents' => 'El importe no es válido.']);
        }

        return DB::transaction(function () use ($fromAccountId, $toAccountId, $amountCents, $date, $kind, $note, $origin, $withinTransaction, $draftId): Transfer {
            $draft = $draftId === null ? null : $this->confirmDraft->lockPending($draftId);

            if ($draft?->origin === DraftOrigin::Recurring) {
                throw ValidationException::withMessages(['draft_id' => 'Un borrador de un movimiento fijo no puede confirmarse como transferencia.']);
            }

            $origin = $draft?->origin->transactionOrigin() ?? $origin;
            $date = ($date ?? CarbonImmutable::today())->startOfDay();
            [$from, $to] = $this->transferAccounts->handle($kind, $fromAccountId, $toAccountId, $date);

            $transfer = new Transfer;
            $transfer->kind = $kind;
            $transfer->from_account_id = $from->id;
            $transfer->to_account_id = $to->id;
            $transfer->amount_cents = $amountCents;
            $transfer->date = $date;
            $transfer->note = $note;
            $transfer->save();

            $out = self::leg($transfer, TransferLeg::Out, $from, -$amountCents, $origin);
            $in = self::leg($transfer, TransferLeg::In, $to, $amountCents, $origin);

            $transfer->setRelation('fromAccount', $from);
            $transfer->setRelation('toAccount', $to);
            $transfer->setRelation('legs', $transfer->newCollection([$out, $in]));

            if ($draft !== null) {
                $this->confirmDraft->handle($draft, transfer: $transfer);
            }

            if ($withinTransaction !== null) {
                $withinTransaction($transfer);
            }

            return $transfer;
        });
    }

    private static function leg(Transfer $transfer, TransferLeg $leg, Account $account, int $signedCents, TransactionOrigin $origin): Transaction
    {
        $transaction = new Transaction;
        $transaction->type = TransactionType::Transfer;
        $transaction->transfer_id = $transfer->id;
        $transaction->transfer_leg = $leg;
        $transaction->account_id = $account->id;
        $transaction->amount_cents = $signedCents;
        $transaction->date = $transfer->date;
        $transaction->note = $transfer->note;
        $transaction->origin = $origin;
        $transaction->save();

        return $transaction;
    }
}

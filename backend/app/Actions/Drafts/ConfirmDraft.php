<?php

declare(strict_types=1);

namespace App\Actions\Drafts;

use App\Enums\DraftStatus;
use App\Enums\OccurrenceStatus;
use App\Enums\TransferLeg;
use App\Exceptions\DomainConflict;
use App\Models\Attachment;
use App\Models\Draft;
use App\Models\RecurringOccurrence;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final class ConfirmDraft
{
    public function lockPending(int $draftId): Draft
    {
        $draft = Draft::query()->lockForUpdate()->find($draftId);

        if ($draft === null) {
            throw ValidationException::withMessages(['draft_id' => 'El borrador no existe.']);
        }

        if (! $draft->isPending()) {
            throw self::notPending();
        }

        return $draft;
    }

    public function handle(Draft $draft, ?Transaction $transaction = null, ?Transfer $transfer = null): Draft
    {
        if (! $draft->isPending()) {
            throw self::notPending();
        }

        [$submitted, $receiptHolder] = match (true) {
            $transaction !== null => [self::transactionValues($transaction), $transaction],
            $transfer !== null => [self::transferValues($transfer), self::outLeg($transfer)],
            default => throw new InvalidArgumentException('A draft is confirmed with a transaction or a transfer.'),
        };

        if ($draft->capture_id !== null) {
            Attachment::query()
                ->where('capture_id', $draft->capture_id)
                ->whereNull('transaction_id')
                ->update(['transaction_id' => $receiptHolder->id, 'updated_at' => CarbonImmutable::now()]);
        }

        if ($draft->recurring_occurrence_id !== null) {
            self::postOccurrence($draft->recurring_occurrence_id, $transaction);
        }

        $draft->corrected_fields = self::correctedFields($draft->proposal(), $submitted);
        $draft->status = DraftStatus::Confirmed;
        $draft->confirmed_at = CarbonImmutable::now();
        $draft->transaction_id = $transaction?->id;
        $draft->transfer_id = $transfer?->id;
        $draft->save();

        return $draft;
    }

    public static function notPending(): DomainConflict
    {
        return new DomainConflict('draft_not_pending', 'El borrador ya se ha confirmado o descartado.');
    }

    private static function postOccurrence(int $occurrenceId, ?Transaction $transaction): void
    {
        if ($transaction === null) {
            throw new InvalidArgumentException('A recurring draft is confirmed with a transaction.');
        }

        $transaction->recurring_occurrence_id = $occurrenceId;
        $transaction->save();

        RecurringOccurrence::query()->whereKey($occurrenceId)->update([
            'status' => OccurrenceStatus::Posted->value,
            'updated_at' => CarbonImmutable::now(),
        ]);
    }

    /**
     * @param  array<string, int|string|null>  $proposal
     * @param  array<string, int|string|null>  $submitted
     * @return list<string>
     */
    private static function correctedFields(array $proposal, array $submitted): array
    {
        $corrected = [];

        foreach ($submitted as $field => $value) {
            if (($proposal[$field] ?? null) !== $value) {
                $corrected[] = $field;
            }
        }

        if (! array_key_exists('to_account_id', $submitted) && ($proposal['to_account_id'] ?? null) !== null) {
            $corrected[] = 'to_account_id';
        }

        return $corrected;
    }

    /**
     * @return array<string, int|string|null>
     */
    private static function transactionValues(Transaction $transaction): array
    {
        return [
            'type' => $transaction->type->value,
            'amount_cents' => $transaction->magnitudeCents(),
            'date' => $transaction->date->toDateString(),
            'account_id' => $transaction->account_id,
            'category_id' => $transaction->category_id,
            'description' => $transaction->description,
            'merchant' => $transaction->merchant,
        ];
    }

    /**
     * @return array<string, int|string|null>
     */
    private static function transferValues(Transfer $transfer): array
    {
        return [
            'type' => 'transfer',
            'amount_cents' => $transfer->amount_cents,
            'date' => $transfer->date->toDateString(),
            'account_id' => $transfer->from_account_id,
            'to_account_id' => $transfer->to_account_id,
        ];
    }

    private static function outLeg(Transfer $transfer): Transaction
    {
        return $transfer->legs()->where('transfer_leg', TransferLeg::Out->value)->firstOrFail();
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Domain\Recurring\GenerationReport;
use App\Domain\Recurring\OccurrenceEligibility;
use App\Domain\Recurring\RecurrenceSlot;
use App\Enums\DraftOrigin;
use App\Enums\DraftStatus;
use App\Enums\OccurrenceStatus;
use App\Enums\TransactionOrigin;
use App\Models\Account;
use App\Models\Draft;
use App\Models\RecurringOccurrence;
use App\Models\RecurringTemplate;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

final class GenerateRecurringTransactions
{
    public const int MAX_SLOTS_PER_TEMPLATE_PER_RUN = 36;

    public const TEMPLATE_AMOUNT_CONFIDENCE = 0.5;

    public function handle(?CarbonImmutable $asOf = null): GenerationReport
    {
        $asOf = ($asOf ?? CarbonImmutable::today())->startOfDay();
        $counts = array_fill_keys(array_column(OccurrenceStatus::cases(), 'value'), 0);
        $failures = [];

        $templates = RecurringTemplate::query()
            ->with('account')
            ->where('starts_on', '<=', $asOf->toDateString())
            ->orderBy('id')
            ->lazyById();

        foreach ($templates as $template) {
            foreach ($this->missingSlots($template, $asOf) as $slot) {
                try {
                    $occurrence = $this->generateSlot($template, $slot);
                } catch (QueryException $exception) {
                    $failures[] = sprintf('Template %d slot %s: %s', $template->id, $slot->slotMonth, $exception->getMessage());

                    continue;
                }

                if ($occurrence !== null) {
                    $counts[$occurrence->status->value]++;
                }
            }
        }

        return new GenerationReport(
            posted: $counts[OccurrenceStatus::Posted->value],
            awaitingAmount: $counts[OccurrenceStatus::AwaitingAmount->value],
            skipped: $counts[OccurrenceStatus::Skipped->value],
            failures: $failures,
        );
    }

    public function generateSlot(RecurringTemplate $template, RecurrenceSlot $slot, ?OccurrenceStatus $status = null): ?RecurringOccurrence
    {
        return DB::transaction(function () use ($template, $slot, $status): ?RecurringOccurrence {
            $template = $status === null
                ? $this->lockTemplateWithAccount($template)
                : $this->lockTemplate($template->id);

            if ($template === null) {
                return null;
            }

            $status ??= OccurrenceEligibility::statusFor($template, $template->account, $slot->dueDate);
            $occurrence = $this->insertOccurrence($template, $slot, $status);

            if ($occurrence === null) {
                return null;
            }

            match ($status) {
                OccurrenceStatus::Posted => $this->postTransaction($template, $occurrence),
                OccurrenceStatus::AwaitingAmount => $this->createDraft($template, $occurrence),
                OccurrenceStatus::Skipped => null,
            };

            return $occurrence;
        });
    }

    private function lockTemplateWithAccount(RecurringTemplate $snapshot): ?RecurringTemplate
    {
        $account = $this->sharedLockAccount($snapshot->account_id);
        $template = $this->lockTemplate($snapshot->id);

        if ($template === null) {
            return null;
        }

        if ($account?->id !== $template->account_id) {
            $account = $this->sharedLockAccount($template->account_id);
        }

        if ($account === null) {
            return null;
        }

        return $template->setRelation('account', $account);
    }

    private function lockTemplate(int $templateId): ?RecurringTemplate
    {
        $template = RecurringTemplate::withTrashed()->lockForUpdate()->find($templateId);

        return $template === null || $template->trashed() ? null : $template;
    }

    private function sharedLockAccount(int $accountId): ?Account
    {
        return Account::withTrashed()->sharedLock()->find($accountId);
    }

    /**
     * @return list<RecurrenceSlot>
     */
    private function missingSlots(RecurringTemplate $template, CarbonImmutable $asOf): array
    {
        $existing = array_flip($template->generatedSlotMonths());

        $missing = array_filter(
            $template->schedule()->slotsBetween($template->generationStartsOn(), $asOf),
            fn (RecurrenceSlot $slot): bool => ! isset($existing[$slot->slotMonth]),
        );

        return array_slice(array_values($missing), 0, self::MAX_SLOTS_PER_TEMPLATE_PER_RUN);
    }

    private function insertOccurrence(RecurringTemplate $template, RecurrenceSlot $slot, OccurrenceStatus $status): ?RecurringOccurrence
    {
        $now = CarbonImmutable::now();

        $row = DB::selectOne(<<<'SQL'
            INSERT INTO recurring_occurrences (template_id, slot_month, due_date, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (template_id, slot_month) DO NOTHING
            RETURNING id
            SQL, [$template->id, $slot->slotMonth, $slot->dueDate->toDateString(), $status->value, $now, $now], false);

        if (! is_object($row) || ! isset($row->id) || ! is_numeric($row->id)) {
            return null;
        }

        $occurrence = new RecurringOccurrence;
        $occurrence->forceFill([
            'id' => (int) $row->id,
            'template_id' => $template->id,
            'slot_month' => $slot->slotMonth,
            'due_date' => $slot->dueDate,
            'status' => $status,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $occurrence->exists = true;
        $occurrence->syncOriginal();

        return $occurrence;
    }

    private function postTransaction(RecurringTemplate $template, RecurringOccurrence $occurrence): void
    {
        $transaction = new Transaction;
        $transaction->type = $template->type->transactionType();
        $transaction->account_id = $template->account_id;
        $transaction->amount_cents = $template->type->signedCents($template->amount_cents);
        $transaction->date = $occurrence->due_date;
        $transaction->category_id = $template->category_id;
        $transaction->description = $template->movementDescription();
        $transaction->merchant = $template->merchant;
        $transaction->note = $template->note;
        $transaction->origin = TransactionOrigin::Recurring;
        $transaction->recurring_occurrence_id = $occurrence->id;
        $transaction->save();
    }

    private function createDraft(RecurringTemplate $template, RecurringOccurrence $occurrence): void
    {
        $draft = new Draft;
        $draft->origin = DraftOrigin::Recurring;
        $draft->status = DraftStatus::Pending;
        $draft->recurring_occurrence_id = $occurrence->id;
        $draft->type = $template->type->draftType();
        $draft->amount_cents = $template->amount_cents;
        $draft->date = $occurrence->due_date;
        $draft->account_id = $template->account_id;
        $draft->category_id = $template->category_id;
        $draft->description = $template->movementDescription();
        $draft->merchant = $template->merchant;

        $fields = array_keys(array_filter($draft->proposal(), fn (int|string|null $value): bool => $value !== null));

        $draft->confidence = [...array_fill_keys($fields, 1), 'amount_cents' => self::TEMPLATE_AMOUNT_CONFIDENCE];
        $draft->field_sources = array_fill_keys($fields, 'template');
        $draft->low_confidence_fields = ['amount_cents'];
        $draft->save();
    }
}

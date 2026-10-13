<?php

declare(strict_types=1);

namespace App\Domain\Recurring;

use App\Enums\OccurrenceStatus;
use App\Models\Account;
use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;

final class OccurrenceEligibility
{
    public static function statusFor(RecurringTemplate $template, Account $account, CarbonImmutable $dueDate): OccurrenceStatus
    {
        if (self::isSkipped($template, $account, $dueDate)) {
            return OccurrenceStatus::Skipped;
        }

        return $template->is_variable ? OccurrenceStatus::AwaitingAmount : OccurrenceStatus::Posted;
    }

    public static function isSkipped(RecurringTemplate $template, Account $account, CarbonImmutable $dueDate): bool
    {
        $due = $dueDate->toDateString();
        $pausedOn = $template->pausedOn()?->toDateString();

        return $account->trashed()
            || $account->isArchived()
            || $due < $account->opening_date->toDateString()
            || ($pausedOn !== null && $due >= $pausedOn);
    }
}

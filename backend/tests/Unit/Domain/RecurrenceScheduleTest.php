<?php

declare(strict_types=1);

use App\Domain\Recurring\RecurrenceSchedule;
use App\Domain\Recurring\RecurrenceSlot;
use App\Enums\RecurringFrequency;

/**
 * @param  list<RecurrenceSlot>  $slots
 * @return array<string, string>
 */
function slotDates(array $slots): array
{
    $dates = [];

    foreach ($slots as $slot) {
        $dates[$slot->slotMonth] = $slot->dueDate->toDateString();
    }

    return $dates;
}

it('clamps day 31 to the end of February and April', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 31, day('2026-01-01'));

    expect(slotDates($schedule->slotsBetween(day('2026-01-01'), day('2026-05-31'))))->toBe([
        '2026-01' => '2026-01-31',
        '2026-02' => '2026-02-28',
        '2026-03' => '2026-03-31',
        '2026-04' => '2026-04-30',
        '2026-05' => '2026-05-31',
    ]);
});

it('clamps day 29 to 29 February in a leap year and to 28 otherwise', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 29, day('2027-12-01'));

    expect(slotDates($schedule->slotsBetween(day('2028-02-01'), day('2028-03-31'))))->toBe([
        '2028-02' => '2028-02-29',
        '2028-03' => '2028-03-29',
    ])->and(slotDates($schedule->slotsBetween(day('2029-02-01'), day('2029-02-28'))))->toBe([
        '2029-02' => '2029-02-28',
    ]);
});

it('anchors quarterly slots on the month of starts_on', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Quarterly, 10, day('2026-02-01'));

    expect(slotDates($schedule->slotsBetween(day('2026-01-01'), day('2027-03-31'))))->toBe([
        '2026-02' => '2026-02-10',
        '2026-05' => '2026-05-10',
        '2026-08' => '2026-08-10',
        '2026-11' => '2026-11-10',
        '2027-02' => '2027-02-10',
    ]);
});

it('anchors yearly slots on the month of starts_on and clamps leap days', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Yearly, 29, day('2028-02-01'));

    expect(slotDates($schedule->slotsBetween(day('2026-01-01'), day('2032-12-31'))))->toBe([
        '2028-02' => '2028-02-29',
        '2029-02' => '2029-02-28',
        '2030-02' => '2030-02-28',
        '2031-02' => '2031-02-28',
        '2032-02' => '2032-02-29',
    ]);
});

it('starts at the first due date on or after starts_on', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 5, day('2026-11-15'));

    expect(slotDates($schedule->slotsBetween(day('2026-11-01'), day('2027-01-31'))))->toBe([
        '2026-12' => '2026-12-05',
        '2027-01' => '2027-01-05',
    ]);
});

it('includes a slot due exactly on starts_on', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 15, day('2026-11-15'));

    expect(slotDates($schedule->slotsBetween(day('2026-11-15'), day('2026-11-15'))))->toBe(['2026-11' => '2026-11-15']);
});

it('stops at ends_on inclusive', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 5, day('2026-01-01'), day('2026-04-05'));

    expect(slotDates($schedule->slotsBetween(day('2026-01-01'), day('2026-12-31'))))->toBe([
        '2026-01' => '2026-01-05',
        '2026-02' => '2026-02-05',
        '2026-03' => '2026-03-05',
        '2026-04' => '2026-04-05',
    ]);

    $endsBefore = new RecurrenceSchedule(RecurringFrequency::Monthly, 5, day('2026-01-01'), day('2026-04-04'));

    expect(array_keys(slotDates($endsBefore->slotsBetween(day('2026-01-01'), day('2026-12-31')))))
        ->toBe(['2026-01', '2026-02', '2026-03']);
});

it('only returns slots whose due date falls inside the window', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 25, day('2026-01-01'));

    expect(slotDates($schedule->slotsBetween(day('2026-09-25'), day('2026-10-24'))))->toBe(['2026-09' => '2026-09-25'])
        ->and($schedule->slotsBetween(day('2026-10-26'), day('2026-10-31')))->toBe([])
        ->and($schedule->slotsBetween(day('2026-10-31'), day('2026-10-01')))->toBe([]);
});

it('returns the next due date on or after today', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 5, day('2026-01-01'));

    expect($schedule->nextDueDate(day('2026-10-13'))?->toDateString())->toBe('2026-11-05')
        ->and($schedule->nextDueDate(day('2026-10-05'))?->toDateString())->toBe('2026-10-05')
        ->and($schedule->nextDueDate(day('2025-06-01'))?->toDateString())->toBe('2026-01-05');
});

it('returns the next yearly and quarterly due dates', function (): void {
    expect((new RecurrenceSchedule(RecurringFrequency::Yearly, 31, day('2026-03-01')))->nextDueDate(day('2026-04-01'))?->toDateString())
        ->toBe('2027-03-31')
        ->and((new RecurrenceSchedule(RecurringFrequency::Quarterly, 1, day('2026-02-01')))->nextDueDate(day('2026-10-14'))?->toDateString())
        ->toBe('2026-11-01');
});

it('skips slots that were already generated when looking for the next due date', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Quarterly, 31, day('2026-10-01'));

    expect($schedule->nextDueDate(day('2026-10-13'))?->toDateString())->toBe('2026-10-31')
        ->and($schedule->nextDueDate(day('2026-10-13'), ['2026-10'])?->toDateString())->toBe('2027-01-31')
        ->and($schedule->nextDueDate(day('2026-10-13'), ['2026-10', '2027-01', '2027-04', '2027-07', '2027-10'])?->toDateString())->toBe('2028-01-31');
});

it('has no next due date once the schedule has ended', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Monthly, 5, day('2026-01-01'), day('2026-06-30'));

    expect($schedule->nextDueDate(day('2026-07-01')))->toBeNull();
});

it('finds the slot of a calendar month', function (): void {
    $schedule = new RecurrenceSchedule(RecurringFrequency::Quarterly, 31, day('2026-02-01'));

    expect($schedule->slotFor('2026-05')?->dueDate->toDateString())->toBe('2026-05-31')
        ->and($schedule->slotFor('2026-03'))->toBeNull()
        ->and($schedule->slotFor('2025-11'))->toBeNull();
});

it('rejects an invalid day of month', function (int $day): void {
    new RecurrenceSchedule(RecurringFrequency::Monthly, $day, day('2026-01-01'));
})->with([0, 32])->throws(InvalidArgumentException::class);

it('rejects ends_on before starts_on', function (): void {
    new RecurrenceSchedule(RecurringFrequency::Monthly, 1, day('2026-05-01'), day('2026-04-30'));
})->throws(InvalidArgumentException::class);

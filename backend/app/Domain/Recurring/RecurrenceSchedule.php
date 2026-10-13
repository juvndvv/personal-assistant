<?php

declare(strict_types=1);

namespace App\Domain\Recurring;

use App\Enums\RecurringFrequency;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

final readonly class RecurrenceSchedule
{
    public const int MIN_DAY = 1;

    public const int MAX_DAY = 31;

    public const string EARLIEST_START = '2000-01-01';

    private const int MONTHS_AHEAD_FOR_NEXT_DUE_DATE = 13;

    private const string SLOT_MONTH_PATTERN = '/^(\d{4})-(0[1-9]|1[0-2])$/';

    public function __construct(
        public RecurringFrequency $frequency,
        public int $dayOfMonth,
        public CarbonImmutable $startsOn,
        public ?CarbonImmutable $endsOn = null,
    ) {
        if ($dayOfMonth < self::MIN_DAY || $dayOfMonth > self::MAX_DAY) {
            throw new InvalidArgumentException("Day of month must be between 1 and 31, got {$dayOfMonth}.");
        }

        if ($endsOn !== null && $endsOn->toDateString() < $startsOn->toDateString()) {
            throw new InvalidArgumentException('A schedule cannot end before it starts.');
        }
    }

    /**
     * @return list<RecurrenceSlot>
     */
    public function slotsBetween(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $first = max($from->toDateString(), $this->startsOn->toDateString());
        $last = $this->endsOn === null ? $to->toDateString() : min($to->toDateString(), $this->endsOn->toDateString());

        if ($first > $last) {
            return [];
        }

        $step = $this->frequency->monthsBetweenSlots();
        $anchor = self::monthIndex($this->startsOn);
        $lastMonth = self::monthIndex(self::date($last));
        $offset = max(0, self::monthIndex(self::date($first)) - $anchor);
        $slots = [];

        for ($month = $anchor + intdiv($offset + $step - 1, $step) * $step; $month <= $lastMonth; $month += $step) {
            $slot = $this->slotInMonth($month);
            $due = $slot->dueDate->toDateString();

            if ($due >= $first && $due <= $last) {
                $slots[] = $slot;
            }
        }

        return $slots;
    }

    public function slotFor(string $slotMonth): ?RecurrenceSlot
    {
        if (preg_match(self::SLOT_MONTH_PATTERN, $slotMonth, $matches) !== 1) {
            throw new InvalidArgumentException("Invalid slot month \"{$slotMonth}\"; expected YYYY-MM.");
        }

        $month = ((int) $matches[1]) * 12 + ((int) $matches[2]) - 1;
        $slot = $this->slotInMonth($month);

        return $this->slotsBetween($slot->dueDate, $slot->dueDate) === [] ? null : $slot;
    }

    /**
     * @param  list<string>  $generatedSlotMonths
     */
    public function nextDueDate(CarbonImmutable $today, array $generatedSlotMonths = []): ?CarbonImmutable
    {
        $from = self::date(max($today->toDateString(), $this->startsOn->toDateString()));
        $generated = array_flip($generatedSlotMonths);
        $monthsAhead = self::MONTHS_AHEAD_FOR_NEXT_DUE_DATE + count($generatedSlotMonths) * $this->frequency->monthsBetweenSlots();

        foreach ($this->slotsBetween($from, $from->addMonthsNoOverflow($monthsAhead)) as $slot) {
            if (! isset($generated[$slot->slotMonth])) {
                return $slot->dueDate;
            }
        }

        return null;
    }

    private function slotInMonth(int $monthIndex): RecurrenceSlot
    {
        $firstOfMonth = self::firstOfMonth(intdiv($monthIndex, 12), $monthIndex % 12 + 1);
        $due = $firstOfMonth->setDay(min($this->dayOfMonth, $firstOfMonth->daysInMonth));

        return new RecurrenceSlot($firstOfMonth->format('Y-m'), $due);
    }

    private static function monthIndex(CarbonImmutable $date): int
    {
        return $date->year * 12 + $date->month - 1;
    }

    private static function firstOfMonth(int $year, int $month): CarbonImmutable
    {
        return CarbonImmutable::create($year, $month, 1)?->startOfDay()
            ?? throw new InvalidArgumentException("Invalid month {$year}-{$month}.");
    }

    private static function date(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date)
            ?: throw new InvalidArgumentException("Invalid date {$date}.");
    }
}

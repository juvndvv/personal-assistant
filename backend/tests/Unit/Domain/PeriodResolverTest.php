<?php

declare(strict_types=1);

use App\Domain\Period\Period;
use App\Domain\Period\PeriodResolver;
use Carbon\CarbonImmutable;

function shape(Period $period): array
{
    return [$period->label, $period->start->toDateString(), $period->end->toDateString()];
}

it('resolves the period containing a date', function (int $startDay, string $date, string $label, string $start, string $end): void {
    $period = (new PeriodResolver($startDay))->forDate(day($date));

    expect(shape($period))->toBe([$label, $start, $end])
        ->and($period->monthStartDay)->toBe($startDay);
})->with([
    'd=1 mid month' => [1, '2026-10-13', '2026-10', '2026-10-01', '2026-10-31'],
    'd=1 first day' => [1, '2026-10-01', '2026-10', '2026-10-01', '2026-10-31'],
    'd=1 last day' => [1, '2026-10-31', '2026-10', '2026-10-01', '2026-10-31'],
    'd=1 february' => [1, '2026-02-14', '2026-02', '2026-02-01', '2026-02-28'],
    'd=1 leap february' => [1, '2028-02-14', '2028-02', '2028-02-01', '2028-02-29'],
    'd=1 new year eve' => [1, '2026-12-31', '2026-12', '2026-12-01', '2026-12-31'],
    'd=2 before start day' => [2, '2026-10-01', '2026-09', '2026-09-02', '2026-10-01'],
    'd=2 on start day' => [2, '2026-10-02', '2026-10', '2026-10-02', '2026-11-01'],
    'd=2 across february' => [2, '2026-03-01', '2026-02', '2026-02-02', '2026-03-01'],
    'd=2 new year day' => [2, '2027-01-01', '2026-12', '2026-12-02', '2027-01-01'],
    'd=15 day before' => [15, '2026-10-14', '2026-09', '2026-09-15', '2026-10-14'],
    'd=15 on start day' => [15, '2026-10-15', '2026-10', '2026-10-15', '2026-11-14'],
    'd=15 leap february' => [15, '2028-02-29', '2028-02', '2028-02-15', '2028-03-14'],
    'd=16 day before' => [16, '2026-10-15', '2026-10', '2026-09-16', '2026-10-15'],
    'd=16 on start day' => [16, '2026-10-16', '2026-11', '2026-10-16', '2026-11-15'],
    'd=16 year rollover' => [16, '2026-12-20', '2027-01', '2026-12-16', '2027-01-15'],
    'd=25 acceptance example' => [25, '2026-10-13', '2026-10', '2026-09-25', '2026-10-24'],
    'd=25 on end day' => [25, '2026-10-24', '2026-10', '2026-09-25', '2026-10-24'],
    'd=25 on start day' => [25, '2026-10-25', '2026-11', '2026-10-25', '2026-11-24'],
    'd=25 year rollover after start' => [25, '2026-12-26', '2027-01', '2026-12-25', '2027-01-24'],
    'd=25 year rollover in january' => [25, '2027-01-10', '2027-01', '2026-12-25', '2027-01-24'],
    'd=25 february' => [25, '2026-02-28', '2026-03', '2026-02-25', '2026-03-24'],
    'd=28 february end' => [28, '2026-02-27', '2026-02', '2026-01-28', '2026-02-27'],
    'd=28 february start' => [28, '2026-02-28', '2026-03', '2026-02-28', '2026-03-27'],
    'd=28 leap day' => [28, '2028-02-29', '2028-03', '2028-02-28', '2028-03-27'],
    'd=28 december' => [28, '2026-12-28', '2027-01', '2026-12-28', '2027-01-27'],
    'd=10 plan example' => [10, '2026-10-20', '2026-10', '2026-10-10', '2026-11-09'],
    'd=10 year rollover' => [10, '2027-01-05', '2026-12', '2026-12-10', '2027-01-09'],
]);

it('resolves a period from its label', function (int $startDay, string $label, string $start, string $end): void {
    expect(shape((new PeriodResolver($startDay))->fromLabel($label)))->toBe([$label, $start, $end]);
})->with([
    [1, '2026-10', '2026-10-01', '2026-10-31'],
    [1, '2028-02', '2028-02-01', '2028-02-29'],
    [2, '2026-12', '2026-12-02', '2027-01-01'],
    [15, '2026-10', '2026-10-15', '2026-11-14'],
    [16, '2026-10', '2026-09-16', '2026-10-15'],
    [25, '2026-10', '2026-09-25', '2026-10-24'],
    [25, '2027-01', '2026-12-25', '2027-01-24'],
    [28, '2026-03', '2026-02-28', '2026-03-27'],
    [28, '2026-01', '2025-12-28', '2026-01-27'],
]);

it('round-trips labels and tiles time without gaps for every start day', function (int $startDay): void {
    $resolver = new PeriodResolver($startDay);
    $period = $resolver->forDate(day('2025-11-20'));

    for ($step = 0; $step < 30; $step++) {
        $next = $resolver->next($period);

        expect($resolver->fromLabel($period->label)->equals($period))->toBeTrue()
            ->and($next->start->toDateString())->toBe($period->end->addDay()->toDateString())
            ->and($resolver->previous($next)->equals($period))->toBeTrue()
            ->and($next->label)->toBe($period->start->startOfMonth()->addMonthsNoOverflow($startDay <= 15 ? 1 : 2)->format('Y-m'));

        $period = $next;
    }
})->with([1, 2, 10, 15, 16, 25, 28]);

it('contains every day between start and end', function (): void {
    $period = (new PeriodResolver(25))->fromLabel('2026-10');

    expect($period->contains(day('2026-09-25')))->toBeTrue()
        ->and($period->contains(day('2026-10-24')))->toBeTrue()
        ->and($period->contains(day('2026-09-24')))->toBeFalse()
        ->and($period->contains(day('2026-10-25')))->toBeFalse();
});

it('lists the last N periods oldest first', function (): void {
    $resolver = new PeriodResolver(25);

    $labels = array_map(fn (Period $period): string => $period->label, $resolver->lastN(4, $resolver->fromLabel('2027-01')));

    expect($labels)->toBe(['2026-10', '2026-11', '2026-12', '2027-01']);
});

it('ends the list at the current period by default', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 00:30', 'Europe/Madrid'));

    $periods = (new PeriodResolver(25))->lastN(2);

    expect(array_map(shape(...), $periods))->toBe([
        ['2026-09', '2026-08-25', '2026-09-24'],
        ['2026-10', '2026-09-25', '2026-10-24'],
    ]);
});

it('resolves the current period from the Madrid date just after midnight', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-24 22:30', 'UTC'));

    expect(shape((new PeriodResolver(25))->current()))->toBe(['2026-11', '2026-10-25', '2026-11-24']);
});

it('rejects start days outside 1..28', function (int $startDay): void {
    new PeriodResolver($startDay);
})->with([0, 29, 31])->throws(InvalidArgumentException::class);

it('rejects malformed labels', function (string $label): void {
    (new PeriodResolver(1))->fromLabel($label);
})->with(['2026-13', '2026-1', '26-10', '2026/10', ''])->throws(InvalidArgumentException::class);

it('rejects a non-positive count', function (): void {
    (new PeriodResolver(1))->lastN(0);
})->throws(InvalidArgumentException::class);

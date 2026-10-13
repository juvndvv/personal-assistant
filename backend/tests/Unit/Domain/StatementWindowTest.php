<?php

declare(strict_types=1);

use App\Domain\Cards\StatementWindow;

it('finds the last statement closed on or before a date', function (int $statementDay, string $date, string $start, string $end): void {
    $window = StatementWindow::lastClosedOn($statementDay, day($date));

    expect([$window->start->toDateString(), $window->end->toDateString()])->toBe([$start, $end]);
})->with([
    'after the statement day' => [5, '2026-10-10', '2026-09-06', '2026-10-05'],
    'on the statement day' => [5, '2026-10-05', '2026-09-06', '2026-10-05'],
    'before the statement day' => [5, '2026-10-04', '2026-08-06', '2026-09-05'],
    'across the year boundary' => [5, '2026-01-04', '2025-11-06', '2025-12-05'],
    'statement day 28 in february' => [28, '2026-03-01', '2026-01-29', '2026-02-28'],
    'statement day 1' => [1, '2026-03-01', '2026-02-02', '2026-03-01'],
    'statement day 28 after month end' => [28, '2026-03-31', '2026-03-01', '2026-03-28'],
]);

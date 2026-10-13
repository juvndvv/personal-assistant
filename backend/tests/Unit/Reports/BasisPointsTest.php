<?php

declare(strict_types=1);

use App\Reports\BasisPoints;

it('rounds ratios to the nearest basis point with integer math', function (int $part, int $whole, ?int $expected): void {
    expect(BasisPoints::ratio($part, $whole))->toBe($expected);
})->with([
    'quarter' => [50_000, 200_000, 2_500],
    'two thirds rounds up' => [100_000, 150_000, 6_667],
    'one third rounds down' => [50_000, 150_000, 3_333],
    'half a basis point rounds away from zero' => [1, 20_000, 1],
    'negative half rounds away from zero' => [-1, 20_000, -1],
    'negative savings' => [-1_000, 4_000, -2_500],
    'over one hundred percent' => [21_000, 20_000, 10_500],
    'zero part' => [0, 5_000, 0],
    'zero whole' => [5_000, 0, null],
    'largest amounts' => [99_999_999_99, 99_999_999_99, 10_000],
]);

it('rejects a negative whole', function (): void {
    BasisPoints::ratio(1, -1);
})->throws(InvalidArgumentException::class);

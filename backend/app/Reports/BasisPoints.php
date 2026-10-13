<?php

declare(strict_types=1);

namespace App\Reports;

use InvalidArgumentException;

final class BasisPoints
{
    public const int WHOLE = 10_000;

    public static function ratio(int $part, int $whole): ?int
    {
        if ($whole < 0) {
            throw new InvalidArgumentException("The whole of a ratio cannot be negative, got {$whole}.");
        }

        if ($whole === 0) {
            return null;
        }

        $magnitude = intdiv(abs($part) * self::WHOLE * 2 + $whole, $whole * 2);

        return $part < 0 ? -$magnitude : $magnitude;
    }
}

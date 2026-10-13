<?php

declare(strict_types=1);

namespace App\Ai;

use RuntimeException;

final class CaptureDeadlineExceeded extends RuntimeException
{
    public static function after(int $seconds): self
    {
        return new self("The capture exceeded its {$seconds} s processing deadline.");
    }
}

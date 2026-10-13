<?php

declare(strict_types=1);

namespace App\Ai;

use App\Enums\CaptureKind;

final readonly class CaptureInput
{
    public function __construct(
        public CaptureKind $kind,
        public string $disk,
        public string $path,
        public string $mime,
    ) {}
}

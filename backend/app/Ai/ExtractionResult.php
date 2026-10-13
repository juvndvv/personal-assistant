<?php

declare(strict_types=1);

namespace App\Ai;

final readonly class ExtractionResult
{
    /**
     * @param  array<string, mixed>|null  $extraction
     */
    public function __construct(
        public bool $successful,
        public ?string $transcript,
        public ?array $extraction,
        public ?string $error,
        public ?string $provider,
        public ?string $model,
        public ?int $transcriptionMs,
        public int $totalMs,
    ) {}
}

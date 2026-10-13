<?php

declare(strict_types=1);

namespace App\Domain\Recurring;

final readonly class GenerationReport
{
    /**
     * @param  list<string>  $failures
     */
    public function __construct(
        public int $posted = 0,
        public int $awaitingAmount = 0,
        public int $skipped = 0,
        public array $failures = [],
    ) {}

    public function generated(): int
    {
        return $this->posted + $this->awaitingAmount + $this->skipped;
    }
}

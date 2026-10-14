<?php

declare(strict_types=1);

namespace App\Domain\Suggestions;

final readonly class CategorizationSuggestion
{
    public const string SOURCE = 'history';

    public function __construct(
        public int $categoryId,
        public ?int $accountId,
        public int $hits,
    ) {}
}

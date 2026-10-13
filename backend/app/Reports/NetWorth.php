<?php

declare(strict_types=1);

namespace App\Reports;

use Carbon\CarbonImmutable;

final readonly class NetWorth
{
    /**
     * @param  list<NetWorthAccount>  $accounts
     */
    public function __construct(
        public CarbonImmutable $date,
        public array $accounts,
    ) {}

    public function totalCents(): int
    {
        return $this->assetsCents() + $this->liabilitiesCents();
    }

    public function assetsCents(): int
    {
        return array_sum(array_map(fn (NetWorthAccount $entry): int => max($entry->balanceCents, 0), $this->accounts));
    }

    public function liabilitiesCents(): int
    {
        return array_sum(array_map(fn (NetWorthAccount $entry): int => min($entry->balanceCents, 0), $this->accounts));
    }
}

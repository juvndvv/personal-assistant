<?php

declare(strict_types=1);

namespace App\Reports;

use App\Models\Account;
use Carbon\CarbonImmutable;

final readonly class NetWorthAccount
{
    public function __construct(
        public Account $account,
        public int $balanceCents,
        public CarbonImmutable $lastUpdatedOn,
        public bool $stale,
    ) {}
}

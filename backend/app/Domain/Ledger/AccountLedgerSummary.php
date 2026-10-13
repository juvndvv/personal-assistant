<?php

declare(strict_types=1);

namespace App\Domain\Ledger;

use App\Enums\AccountType;
use App\Models\Account;
use Carbon\CarbonImmutable;

final readonly class AccountLedgerSummary
{
    public const int STALE_AFTER_DAYS = 30;

    public function __construct(
        public int $accountId,
        public int $balanceCents,
        public ?CarbonImmutable $lastMovementDate,
        public ?CarbonImmutable $lastAdjustmentDate,
    ) {}

    public function lastUpdatedOn(Account $account): CarbonImmutable
    {
        if (self::isManuallyValued($account->type)) {
            return $this->lastAdjustmentDate ?? $this->lastMovementDate ?? $account->opening_date;
        }

        return $this->lastMovementDate ?? $account->opening_date;
    }

    public function isStale(Account $account, CarbonImmutable $today): bool
    {
        return self::isManuallyValued($account->type)
            && $this->lastUpdatedOn($account)->lessThan($today->subDays(self::STALE_AFTER_DAYS));
    }

    private static function isManuallyValued(AccountType $type): bool
    {
        return in_array($type, [AccountType::Cash, AccountType::SavingsInvestment], true);
    }
}

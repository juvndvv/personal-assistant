<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Models\Account;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class ArchiveAccount
{
    public function __construct(private ClearAccountReferences $clearAccountReferences) {}

    public function handle(Account $account): Account
    {
        return DB::transaction(function () use ($account): Account {
            if (! $account->isArchived()) {
                $account->archived_at = CarbonImmutable::now();
                $account->save();
            }

            $this->clearAccountReferences->handle($account);

            return $account;
        });
    }
}

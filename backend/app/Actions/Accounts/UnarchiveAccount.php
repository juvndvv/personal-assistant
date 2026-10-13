<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Models\Account;
use Illuminate\Support\Facades\DB;

final class UnarchiveAccount
{
    public function handle(Account $account): Account
    {
        return DB::transaction(function () use ($account): Account {
            $account->archived_at = null;
            $account->save();

            return $account;
        });
    }
}

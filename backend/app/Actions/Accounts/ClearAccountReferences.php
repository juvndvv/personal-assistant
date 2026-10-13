<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Models\Account;
use App\Models\Setting;

final class ClearAccountReferences
{
    public function handle(Account $account): void
    {
        $settings = Setting::current();

        if ($settings->default_account_id === $account->id) {
            $settings->default_account_id = null;
        }

        if ($settings->last_used_account_id === $account->id) {
            $settings->last_used_account_id = null;
        }

        $settings->save();

        Account::query()->where('settlement_account_id', $account->id)->update(['settlement_account_id' => null]);
    }
}

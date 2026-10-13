<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Enums\AccountType;
use App\Models\Account;
use Illuminate\Support\Facades\DB;

final class CreateAccount
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(array $attributes): Account
    {
        return DB::transaction(function () use ($attributes): Account {
            $account = new Account;
            $account->fill($attributes);

            if ($account->type !== AccountType::CreditCard) {
                $account->statement_day = null;
                $account->settlement_account_id = null;
            }

            $account->save();

            return $account->refresh();
        });
    }
}

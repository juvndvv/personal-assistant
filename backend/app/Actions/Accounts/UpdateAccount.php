<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Enums\AccountType;
use App\Exceptions\DomainConflict;
use App\Models\Account;
use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class UpdateAccount
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(Account $account, array $attributes): Account
    {
        return DB::transaction(function () use ($account, $attributes): Account {
            $account = Account::query()->lockForUpdate()->findOrFail($account->id);
            $originalType = $account->type;
            $account->fill($attributes);

            if ($account->isDirty('type') && $account->transactions()->withTrashed()->exists()) {
                throw ValidationException::withMessages([
                    'type' => 'No se puede cambiar el tipo de una cuenta que ya tiene movimientos.',
                ]);
            }

            if ($account->isDirty('opening_date')) {
                $this->ensureOpeningDateBeforeMovements($account);
                $this->stopRecurringBackfillWhenOpeningMovesEarlier($account);
            }

            if ($account->type !== AccountType::CreditCard) {
                $account->statement_day = null;
                $account->settlement_account_id = null;
            }

            $account->save();

            if ($originalType !== AccountType::CreditCard && $account->type === AccountType::CreditCard) {
                Account::query()->where('settlement_account_id', $account->id)->update(['settlement_account_id' => null]);
            }

            return $account;
        });
    }

    private function stopRecurringBackfillWhenOpeningMovesEarlier(Account $account): void
    {
        $previous = $account->getOriginal('opening_date');

        if (! $previous instanceof CarbonImmutable || ! $account->opening_date->lessThan($previous)) {
            return;
        }

        RecurringTemplate::query()
            ->where('account_id', $account->id)
            ->whereHas('occurrences')
            ->lockForUpdate()
            ->get()
            ->each(function (RecurringTemplate $template): void {
                $template->stopBackfillBefore(CarbonImmutable::today());
                $template->save();
            });
    }

    private function ensureOpeningDateBeforeMovements(Account $account): void
    {
        $earliest = $account->transactions()->withTrashed()->min('date');

        if (is_string($earliest) && CarbonImmutable::parse($earliest)->lessThan($account->opening_date)) {
            throw new DomainConflict(
                'opening_date_after_movements',
                'La fecha de apertura no puede ser posterior al primer movimiento de la cuenta.',
            );
        }
    }
}

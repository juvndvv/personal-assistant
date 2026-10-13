<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Actions\Recurring\DeleteRecurringTemplate;
use App\Exceptions\DomainConflict;
use App\Models\Account;
use App\Models\RecurringTemplate;
use Illuminate\Support\Facades\DB;

final readonly class DeleteAccount
{
    public function __construct(
        private ClearAccountReferences $clearAccountReferences,
        private DeleteRecurringTemplate $deleteRecurringTemplate,
    ) {}

    public function handle(Account $account): void
    {
        DB::transaction(function () use ($account): void {
            $account = Account::query()->lockForUpdate()->findOrFail($account->id);

            if ($account->hasMovements()) {
                throw new DomainConflict(
                    'account_has_movements',
                    'La cuenta tiene movimientos y no se puede eliminar. Archívala en su lugar.',
                );
            }

            $this->clearAccountReferences->handle($account);

            foreach (RecurringTemplate::query()->where('account_id', $account->id)->get() as $template) {
                $this->deleteRecurringTemplate->handle($template);
            }

            $account->delete();
        });
    }
}

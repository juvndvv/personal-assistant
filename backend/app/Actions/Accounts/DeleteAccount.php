<?php

declare(strict_types=1);

namespace App\Actions\Accounts;

use App\Exceptions\DomainConflict;
use App\Models\Account;
use Illuminate\Support\Facades\DB;

final readonly class DeleteAccount
{
    public function __construct(private ClearAccountReferences $clearAccountReferences) {}

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
            $account->delete();
        });
    }
}

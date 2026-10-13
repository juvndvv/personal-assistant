<?php

declare(strict_types=1);

namespace App\Actions\Transfers;

use App\Domain\Ledger\MovementRules;
use App\Enums\AccountType;
use App\Enums\TransferKind;
use App\Models\Account;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

final readonly class TransferAccounts
{
    public function __construct(private MovementRules $rules) {}

    /**
     * @return array{Account, Account}
     */
    public function handle(
        TransferKind $kind,
        int $fromAccountId,
        int $toAccountId,
        CarbonImmutable $date,
        bool $fromMustBeWritable = true,
        bool $toMustBeWritable = true,
    ): array {
        if ($fromAccountId === $toAccountId) {
            throw ValidationException::withMessages([
                'to_account_id' => 'La cuenta de destino debe ser distinta de la de origen.',
            ]);
        }

        $from = $fromMustBeWritable
            ? $this->rules->writableAccount($fromAccountId, 'from_account_id')
            : Account::query()->withTrashed()->findOrFail($fromAccountId);
        $to = $toMustBeWritable
            ? $this->rules->writableAccount($toAccountId, 'to_account_id')
            : Account::query()->withTrashed()->findOrFail($toAccountId);

        if ($kind === TransferKind::CardSettlement) {
            if ($to->type !== AccountType::CreditCard) {
                throw ValidationException::withMessages([
                    'to_account_id' => 'Una liquidación de tarjeta debe ir a una tarjeta de crédito.',
                ]);
            }

            if ($from->type === AccountType::CreditCard) {
                throw ValidationException::withMessages([
                    'from_account_id' => 'Una tarjeta no puede liquidarse desde otra tarjeta de crédito.',
                ]);
            }
        }

        $this->rules->ensureDateAllowed($from, $date);
        $this->rules->ensureDateAllowed($to, $date);

        return [$from, $to];
    }
}

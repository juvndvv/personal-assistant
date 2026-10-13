<?php

declare(strict_types=1);

namespace App\Actions\Ledger;

use App\Domain\Ledger\BalanceCalculator;
use App\Domain\Transactions\Changes;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final readonly class UpdateBalanceAdjustment
{
    public function __construct(private BalanceCalculator $balances) {}

    public function handle(Transaction $adjustment, Changes $changes): Transaction
    {
        if ($adjustment->type !== TransactionType::Adjustment) {
            throw new InvalidArgumentException("Transaction {$adjustment->id} is not a balance adjustment.");
        }

        return DB::transaction(function () use ($adjustment, $changes): Transaction {
            $account = Account::query()->withTrashed()->lockForUpdate()->findOrFail($adjustment->account_id);
            $adjustment = Transaction::query()->lockForUpdate()->findOrFail($adjustment->id);

            $date = $changes->date('date') ?? $adjustment->date;
            $targetCents = $changes->integer('target_balance_cents') ?? $adjustment->adjustment_target_cents ?? 0;

            $this->ensureDateAllowed($account, $date);

            $balanceWithoutAdjustment = $this->balances->forAccount($account->id, $date)
                - ($adjustment->date->lessThanOrEqualTo($date) ? $adjustment->amount_cents : 0);
            $deltaCents = $targetCents - $balanceWithoutAdjustment;

            if ($deltaCents === 0) {
                throw ValidationException::withMessages([
                    'target_balance_cents' => 'El saldo indicado coincide con el saldo en esa fecha; no hay nada que ajustar.',
                ]);
            }

            $adjustment->date = $date;
            $adjustment->amount_cents = $deltaCents;
            $adjustment->adjustment_target_cents = $targetCents;

            if ($changes->has('note')) {
                $adjustment->note = $changes->text('note');
            }

            $adjustment->save();

            return $adjustment;
        });
    }

    private function ensureDateAllowed(Account $account, CarbonImmutable $date): void
    {
        if ($date->greaterThan(CarbonImmutable::today())) {
            throw ValidationException::withMessages(['date' => 'La fecha del ajuste no puede ser futura.']);
        }

        if ($date->lessThan($account->opening_date)) {
            throw ValidationException::withMessages([
                'date' => 'La fecha del ajuste no puede ser anterior a la fecha de apertura de la cuenta.',
            ]);
        }
    }
}

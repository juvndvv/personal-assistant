<?php

declare(strict_types=1);

namespace App\Actions\Ledger;

use App\Domain\Ledger\BalanceCalculator;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final readonly class RecordBalanceAdjustment
{
    public function __construct(private BalanceCalculator $balances) {}

    public function handle(Account $account, CarbonImmutable $date, int $targetBalanceCents, ?string $note = null): Transaction
    {
        return DB::transaction(function () use ($account, $date, $targetBalanceCents, $note): Transaction {
            $account = Account::query()->lockForUpdate()->findOrFail($account->id);
            $date = $date->startOfDay();

            $this->ensureAdjustable($account, $date);

            $deltaCents = $targetBalanceCents - $this->balances->forAccount($account->id, $date);

            if ($deltaCents === 0) {
                throw ValidationException::withMessages([
                    'target_balance_cents' => 'El saldo indicado coincide con el saldo actual en esa fecha; no hay nada que ajustar.',
                ]);
            }

            $adjustment = new Transaction;
            $adjustment->type = TransactionType::Adjustment;
            $adjustment->account_id = $account->id;
            $adjustment->amount_cents = $deltaCents;
            $adjustment->adjustment_target_cents = $targetBalanceCents;
            $adjustment->date = $date;
            $adjustment->note = $note;
            $adjustment->origin = TransactionOrigin::Manual;
            $adjustment->save();

            return $adjustment->refresh();
        });
    }

    private function ensureAdjustable(Account $account, CarbonImmutable $date): void
    {
        if ($account->isArchived()) {
            throw ValidationException::withMessages([
                'account_id' => 'La cuenta está archivada y no admite movimientos.',
            ]);
        }

        if ($date->greaterThan(CarbonImmutable::today())) {
            throw ValidationException::withMessages([
                'date' => 'La fecha del ajuste no puede ser futura.',
            ]);
        }

        if ($date->lessThan($account->opening_date)) {
            throw ValidationException::withMessages([
                'date' => 'La fecha del ajuste no puede ser anterior a la fecha de apertura de la cuenta.',
            ]);
        }
    }
}

<?php

declare(strict_types=1);

use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Domain\Ledger\BalanceCalculator;
use App\Enums\AccountType;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 09:00', 'Europe/Madrid'));
    $this->account = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 1_000_000)->create();
});

function adjustmentErrors(Closure $callback): array
{
    try {
        $callback();
    } catch (ValidationException $exception) {
        return $exception->errors();
    }

    return [];
}

it('stores the delta that reaches the target balance at the date', function (): void {
    Transaction::factory()->on($this->account, day('2026-09-01'))->expense(20_000)->create();
    Transaction::factory()->on($this->account, day('2026-10-10'))->income(5_000)->create();

    $adjustment = app(RecordBalanceAdjustment::class)->handle($this->account, day('2026-09-30'), 1_250_000, 'Valor cartera');

    expect($adjustment->type)->toBe(TransactionType::Adjustment)
        ->and($adjustment->amount_cents)->toBe(1_250_000 - 980_000)
        ->and($adjustment->adjustment_target_cents)->toBe(1_250_000)
        ->and($adjustment->origin)->toBe(TransactionOrigin::Manual)
        ->and($adjustment->note)->toBe('Valor cartera')
        ->and(app(BalanceCalculator::class)->forAccount($this->account->id, day('2026-09-30')))->toBe(1_250_000)
        ->and(app(BalanceCalculator::class)->forAccount($this->account->id))->toBe(1_255_000);
});

it('accepts a negative delta and a negative target', function (): void {
    $adjustment = app(RecordBalanceAdjustment::class)->handle($this->account, day('2026-10-13'), -500);

    expect($adjustment->amount_cents)->toBe(-1_000_500)
        ->and(app(BalanceCalculator::class)->forAccount($this->account->id))->toBe(-500);
});

it('rejects a zero delta', function (): void {
    expect(adjustmentErrors(fn () => app(RecordBalanceAdjustment::class)->handle($this->account, day('2026-10-13'), 1_000_000)))
        ->toHaveKey('target_balance_cents');
});

it('rejects a future date', function (): void {
    expect(adjustmentErrors(fn () => app(RecordBalanceAdjustment::class)->handle($this->account, day('2026-10-14'), 5)))
        ->toHaveKey('date');
});

it('rejects a date before the opening date', function (): void {
    expect(adjustmentErrors(fn () => app(RecordBalanceAdjustment::class)->handle($this->account, day('2025-12-31'), 5)))
        ->toHaveKey('date');
});

it('accepts the opening date itself', function (): void {
    $adjustment = app(RecordBalanceAdjustment::class)->handle($this->account, day('2026-01-01'), 900_000);

    expect($adjustment->amount_cents)->toBe(-100_000);
});

it('rejects an archived account', function (): void {
    $this->account->update(['archived_at' => now()]);

    expect(adjustmentErrors(fn () => app(RecordBalanceAdjustment::class)->handle($this->account, day('2026-10-13'), 5)))
        ->toHaveKey('account_id');
});

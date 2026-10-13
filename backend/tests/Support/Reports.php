<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Actions\Transfers\RegisterTransfer;
use App\Enums\AccountType;
use App\Enums\TransferKind;
use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;

final class Reports
{
    public const int SALARY_CENTS = 200_000;

    public const int EXPENSES_CENTS = 150_000;

    public const int TRANSFER_CENTS = 30_000;

    public const int ADJUSTMENT_CENTS = 5_000;

    public const int SETTLEMENT_CENTS = 12_000;

    public static function useMonthStartDay(int $day): void
    {
        Setting::current()->update(['month_start_day' => $day]);
    }

    /**
     * @return array{
     *     checking: Account, savings: Account, card: Account,
     *     food: Category, supermarket: Category, housing: Category, salary: Category
     * }
     */
    public static function goldenLedger(): array
    {
        $checking = Account::factory()->openedOn(day('2026-01-01'), 100_000)->create(['name' => 'BBVA']);
        $savings = Account::factory()->ofType(AccountType::SavingsInvestment)->openedOn(day('2026-01-01'), 500_000)->create(['name' => 'Ahorro']);
        $card = Account::factory()->creditCard()->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);

        $food = Category::factory()->create(['name' => 'Alimentación']);
        $supermarket = Category::factory()->childOf($food)->create(['name' => 'Supermercado']);
        $housing = Category::factory()->create(['name' => 'Vivienda']);
        $salary = Category::factory()->income()->create(['name' => 'Nómina']);

        Ledger::income($checking, self::SALARY_CENTS, '2026-10-02', $salary);
        Ledger::expense($checking, 20_000, '2026-10-05', $food);
        Ledger::expense($card, 50_000, '2026-10-06', $supermarket);
        Ledger::expense($checking, 30_000, '2026-10-12', $supermarket);
        Ledger::expense($checking, 50_000, '2026-10-20', $housing);

        $register = app(RegisterTransfer::class);
        $register->handle($checking->id, $savings->id, self::TRANSFER_CENTS, day('2026-10-10'));
        $register->handle($checking->id, $card->id, self::SETTLEMENT_CENTS, day('2026-10-11'), TransferKind::CardSettlement);

        app(RecordBalanceAdjustment::class)->handle(
            $savings,
            day('2026-10-15'),
            Ledger::balance($savings, day('2026-10-15')) + self::ADJUSTMENT_CENTS,
        );

        return compact('checking', 'savings', 'card', 'food', 'supermarket', 'housing', 'salary');
    }
}

<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Enums\AccountType;
use App\Enums\CategoryKind;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Enums\TransferKind;
use App\Enums\TransferLeg;
use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

final class DevSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(DefaultCategoriesSeeder::class);

        if (Account::query()->withTrashed()->exists()) {
            return;
        }

        DB::transaction(function (): void {
            $opening = CarbonImmutable::today()->subDays(90);

            $checking = $this->account('BBVA', AccountType::Checking, 150_000, $opening);
            $cash = $this->account('Efectivo', AccountType::Cash, 8_000, $opening);
            $savings = $this->account('Ahorro', AccountType::SavingsInvestment, 1_000_000, $opening);
            $card = $this->account('Visa', AccountType::CreditCard, 0, $opening, statementDay: 5, settlementAccountId: $checking->id);

            Setting::current()->update(['default_account_id' => $checking->id, 'last_used_account_id' => $checking->id]);

            for ($monthsAgo = 2; $monthsAgo >= 0; $monthsAgo--) {
                $month = CarbonImmutable::today()->subMonthsNoOverflow($monthsAgo)->startOfMonth();
                $this->movement($checking, TransactionType::Income, 210_000, $month->addDays(0), 'Nómina', 'Nómina', 'Empresa S.L.');
                $this->movement($checking, TransactionType::Expense, 85_000, $month->addDays(1), 'Alquiler/Hipoteca', 'Alquiler', null, TransactionOrigin::Recurring);
                $this->movement($card, TransactionType::Expense, 6_245, $month->addDays(3), 'Supermercado', 'Compra semanal', 'Mercadona', TransactionOrigin::Voice);
                $this->movement($card, TransactionType::Expense, 3_480, $month->addDays(9), 'Restaurantes', 'Cena', 'La Tagliatella', TransactionOrigin::Photo);
                $this->movement($cash, TransactionType::Expense, 250, $month->addDays(4), 'Cafeterías', 'Café', 'Café Central');
                $this->movement($checking, TransactionType::Expense, 1_299, $month->addDays(6), 'Suscripciones', 'Streaming', 'Netflix');
            }

            $lastMonth = CarbonImmutable::today()->subMonthNoOverflow()->startOfMonth();
            $this->transfer(TransferKind::Transfer, $checking, $savings, 20_000, $lastMonth->addDays(2));
            $this->transfer(TransferKind::CardSettlement, $checking, $card, 9_725, $lastMonth->addDays(5));

            app(RecordBalanceAdjustment::class)->handle($savings, CarbonImmutable::today()->subDays(10), 1_034_500, 'Valor cartera');
        });
    }

    private function account(string $name, AccountType $type, int $openingBalanceCents, CarbonImmutable $openingDate, ?int $statementDay = null, ?int $settlementAccountId = null): Account
    {
        return Account::query()->create([
            'name' => $name,
            'type' => $type,
            'opening_balance_cents' => $openingBalanceCents,
            'opening_date' => $openingDate,
            'statement_day' => $statementDay,
            'settlement_account_id' => $settlementAccountId,
        ]);
    }

    private function movement(Account $account, TransactionType $type, int $magnitudeCents, CarbonImmutable $date, string $categoryName, string $description, ?string $merchant, TransactionOrigin $origin = TransactionOrigin::Manual): void
    {
        if ($date->greaterThan(CarbonImmutable::today()) || $date->lessThan($account->opening_date)) {
            return;
        }

        $category = Category::query()
            ->where('kind', $type === TransactionType::Income ? CategoryKind::Income : CategoryKind::Expense)
            ->where('name', $categoryName)
            ->firstOrFail();

        Transaction::query()->create([
            'type' => $type,
            'account_id' => $account->id,
            'amount_cents' => $type === TransactionType::Expense ? -$magnitudeCents : $magnitudeCents,
            'date' => $date,
            'category_id' => $category->id,
            'description' => $description,
            'merchant' => $merchant,
            'origin' => $origin,
        ]);
    }

    private function transfer(TransferKind $kind, Account $from, Account $to, int $amountCents, CarbonImmutable $date): void
    {
        $transfer = Transfer::query()->create([
            'kind' => $kind,
            'from_account_id' => $from->id,
            'to_account_id' => $to->id,
            'amount_cents' => $amountCents,
            'date' => $date,
        ]);

        foreach ([[TransferLeg::Out, $from, -$amountCents], [TransferLeg::In, $to, $amountCents]] as [$leg, $account, $signedCents]) {
            Transaction::query()->create([
                'type' => TransactionType::Transfer,
                'account_id' => $account->id,
                'amount_cents' => $signedCents,
                'date' => $date,
                'transfer_id' => $transfer->id,
                'transfer_leg' => $leg,
            ]);
        }
    }
}

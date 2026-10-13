<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\AccountType;
use App\Enums\CategoryKind;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Enums\TransferKind;
use App\Enums\TransferLeg;
use App\Models\Account;
use App\Models\Category;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

final class PerformanceSeeder extends Seeder
{
    public const string PREFIX = 'Perf';

    public const int YEARS = 3;

    private const int EXPENSE_PARENTS = 8;

    private const int CHILDREN_PER_EXPENSE_PARENT = 3;

    private const int INCOME_PARENTS = 4;

    private const int CHUNK = 1_000;

    private const int SEED = 50_000;

    private const int CONFIRMED_CAPTURES = 400;

    public int $movements = 50_000;

    /**
     * @var array<int, int>
     */
    private array $balances = [];

    public function run(): void
    {
        if (app()->isProduction()) {
            throw new RuntimeException('The performance seed is for local and QA databases only.');
        }

        if (Account::query()->withTrashed()->where('name', 'like', self::PREFIX.' %')->exists()) {
            return;
        }

        mt_srand(self::SEED);

        DB::transaction(function (): void {
            $today = CarbonImmutable::today();
            $opening = $today->subYears(self::YEARS)->startOfMonth();

            $accounts = $this->accounts($opening);
            [$expenseCategories, $incomeCategories] = $this->categories();

            $events = $this->events($opening, $today, $accounts, $expenseCategories, $incomeCategories);
            $transferIds = $this->insertTransfers($events);
            $this->insertTransactions($events, $transferIds);
            $this->insertConfirmedCaptures();

            Account::query()->whereKey($accounts['archived'])->update(['archived_at' => $today->subMonths(2)]);
        });

        DB::statement('ANALYZE transactions');
    }

    /**
     * @return array{checking: int, card: int, cash: int, savings: int, archived: int}
     */
    private function accounts(CarbonImmutable $opening): array
    {
        $checking = $this->account('Nómina', AccountType::Checking, 500_000, $opening);

        return [
            'checking' => $checking,
            'card' => $this->account('Visa', AccountType::CreditCard, 0, $opening, statementDay: 5, settlementAccountId: $checking),
            'cash' => $this->account('Efectivo', AccountType::Cash, 20_000, $opening),
            'savings' => $this->account('Ahorro', AccountType::SavingsInvestment, 2_000_000, $opening),
            'archived' => $this->account('Antigua', AccountType::Checking, 10_000, $opening),
        ];
    }

    private function account(string $name, AccountType $type, int $openingBalanceCents, CarbonImmutable $opening, ?int $statementDay = null, ?int $settlementAccountId = null): int
    {
        $account = Account::query()->create([
            'name' => self::PREFIX.' '.$name,
            'type' => $type,
            'opening_balance_cents' => $openingBalanceCents,
            'opening_date' => $opening,
            'statement_day' => $statementDay,
            'settlement_account_id' => $settlementAccountId,
        ]);

        $this->balances[$account->id] = $openingBalanceCents;

        return $account->id;
    }

    /**
     * @return array{list<int>, list<int>}
     */
    private function categories(): array
    {
        $expense = [];
        $income = [];

        for ($parent = 1; $parent <= self::EXPENSE_PARENTS; $parent++) {
            $parentId = $this->category(CategoryKind::Expense, "Gasto {$parent}");
            $expense[] = $parentId;

            for ($child = 1; $child <= self::CHILDREN_PER_EXPENSE_PARENT; $child++) {
                $expense[] = $this->category(CategoryKind::Expense, "Gasto {$parent}.{$child}", $parentId);
            }
        }

        for ($parent = 1; $parent <= self::INCOME_PARENTS; $parent++) {
            $parentId = $this->category(CategoryKind::Income, "Ingreso {$parent}");
            $income[] = $parentId;
            $income[] = $this->category(CategoryKind::Income, "Ingreso {$parent}.1", $parentId);
        }

        return [$expense, $income];
    }

    private function category(CategoryKind $kind, string $name, ?int $parentId = null): int
    {
        return Category::query()->create(['kind' => $kind, 'name' => self::PREFIX.' '.$name, 'parent_id' => $parentId])->id;
    }

    /**
     * @param  array{checking: int, card: int, cash: int, savings: int, archived: int}  $accounts
     * @param  list<int>  $expenseCategories
     * @param  list<int>  $incomeCategories
     * @return list<array<string, mixed>>
     */
    private function events(CarbonImmutable $opening, CarbonImmutable $today, array $accounts, array $expenseCategories, array $incomeCategories): array
    {
        $days = (int) round($opening->diffInDays($today)) + 1;
        $transfers = intdiv($this->movements, 50);
        $adjustments = intdiv($this->movements, 200);
        $incomes = intdiv($this->movements - 2 * $transfers - $adjustments, 20);
        $expenses = $this->movements - 2 * $transfers - $adjustments - $incomes;

        $spendingAccounts = [$accounts['checking'], $accounts['card'], $accounts['card'], $accounts['cash'], $accounts['archived']];
        $events = [];

        foreach ($this->spread($expenses, $days) as $index => $offset) {
            $events[] = ['kind' => 'expense', 'offset' => $offset, 'account' => $spendingAccounts[$index % 5], 'category' => $expenseCategories[mt_rand(0, count($expenseCategories) - 1)], 'cents' => mt_rand(100, 20_000)];
        }

        foreach ($this->spread($incomes, $days) as $offset) {
            $events[] = ['kind' => 'income', 'offset' => $offset, 'account' => $accounts['checking'], 'category' => $incomeCategories[mt_rand(0, count($incomeCategories) - 1)], 'cents' => mt_rand(50_000, 300_000)];
        }

        foreach ($this->spread($transfers, $days) as $index => $offset) {
            $events[] = match ($index % 3) {
                0 => ['kind' => 'transfer', 'offset' => $offset, 'from' => $accounts['checking'], 'to' => $accounts['card'], 'transfer_kind' => TransferKind::CardSettlement, 'cents' => mt_rand(20_000, 150_000)],
                1 => ['kind' => 'transfer', 'offset' => $offset, 'from' => $accounts['checking'], 'to' => $accounts['savings'], 'transfer_kind' => TransferKind::Transfer, 'cents' => mt_rand(10_000, 100_000)],
                default => ['kind' => 'transfer', 'offset' => $offset, 'from' => $accounts['checking'], 'to' => $accounts['cash'], 'transfer_kind' => TransferKind::Transfer, 'cents' => mt_rand(2_000, 20_000)],
            };
        }

        foreach ($this->spread($adjustments, $days) as $index => $offset) {
            $events[] = ['kind' => 'adjustment', 'offset' => $offset, 'account' => $index % 2 === 0 ? $accounts['savings'] : $accounts['cash'], 'cents' => mt_rand(-5_000, 15_000) ?: 1];
        }

        usort($events, fn (array $left, array $right): int => $left['offset'] <=> $right['offset']);

        return array_map(fn (array $event, int $index): array => [
            ...$event,
            'date' => $opening->addDays(self::integer($event['offset'])),
            'marker' => self::PREFIX." #{$index}",
        ], $events, array_keys($events));
    }

    /**
     * @return list<int>
     */
    private function spread(int $count, int $days): array
    {
        return $count <= 0 ? [] : array_map(fn (int $index): int => intdiv($index * $days, $count), range(0, $count - 1));
    }

    /**
     * @param  list<array<string, mixed>>  $events
     * @return array<string, int>
     */
    private function insertTransfers(array $events): array
    {
        $rows = [];

        foreach ($events as $event) {
            if ($event['kind'] !== 'transfer') {
                continue;
            }

            $date = self::date($event['date']);
            $rows[] = [
                'kind' => $event['transfer_kind'] instanceof TransferKind ? $event['transfer_kind']->value : TransferKind::Transfer->value,
                'from_account_id' => $event['from'],
                'to_account_id' => $event['to'],
                'amount_cents' => $event['cents'],
                'date' => $date->toDateString(),
                'note' => $event['marker'],
                'created_at' => $date->setTime(9, 0),
                'updated_at' => $date->setTime(9, 0),
            ];
        }

        foreach (array_chunk($rows, self::CHUNK) as $chunk) {
            DB::table('transfers')->insert($chunk);
        }

        $ids = [];

        foreach (DB::table('transfers')->where('note', 'like', self::PREFIX.' #%')->get(['id', 'note']) as $transfer) {
            $ids[is_string($transfer->note) ? $transfer->note : ''] = self::integer($transfer->id);
        }

        return $ids;
    }

    /**
     * @param  list<array<string, mixed>>  $events
     * @param  array<string, int>  $transferIds
     */
    private function insertTransactions(array $events, array $transferIds): void
    {
        $rows = [];

        foreach ($events as $event) {
            $date = self::date($event['date']);
            $createdAt = $date->setTime(mt_rand(7, 22), mt_rand(0, 59));
            $cents = self::integer($event['cents']);

            if ($event['kind'] === 'transfer') {
                $transferId = $transferIds[is_string($event['marker']) ? $event['marker'] : ''];
                $rows[] = $this->leg($transferId, TransferLeg::Out, self::integer($event['from']), -$cents, $date, $createdAt);
                $rows[] = $this->leg($transferId, TransferLeg::In, self::integer($event['to']), $cents, $date, $createdAt);

                continue;
            }

            $accountId = self::integer($event['account']);

            $rows[] = match ($event['kind']) {
                'adjustment' => $this->row(TransactionType::Adjustment, $accountId, $cents, $date, $createdAt, [
                    'adjustment_target_cents' => $this->balances[$accountId] + $cents,
                    'note' => 'Valor actualizado',
                ]),
                'income' => $this->row(TransactionType::Income, $accountId, $cents, $date, $createdAt, [
                    'category_id' => $event['category'],
                    'description' => 'Ingreso',
                    'origin' => TransactionOrigin::Manual->value,
                ]),
                default => $this->row(TransactionType::Expense, $accountId, -$cents, $date, $createdAt, [
                    'category_id' => $event['category'],
                    'description' => 'Compra '.Str::lower(Str::random(6)),
                    'merchant' => ['Mercadona', 'Café Central', 'Repsol', 'Amazon', 'Renfe'][mt_rand(0, 4)],
                    'origin' => [TransactionOrigin::Manual, TransactionOrigin::Manual, TransactionOrigin::Voice, TransactionOrigin::Photo, TransactionOrigin::Recurring][mt_rand(0, 4)]->value,
                ]),
            };
        }

        foreach (array_chunk($rows, self::CHUNK) as $chunk) {
            DB::table('transactions')->insert($chunk);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function leg(int $transferId, TransferLeg $leg, int $accountId, int $signedCents, CarbonImmutable $date, CarbonImmutable $createdAt): array
    {
        return $this->row(TransactionType::Transfer, $accountId, $signedCents, $date, $createdAt, [
            'transfer_id' => $transferId,
            'transfer_leg' => $leg->value,
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function row(TransactionType $type, int $accountId, int $signedCents, CarbonImmutable $date, CarbonImmutable $createdAt, array $attributes): array
    {
        $this->balances[$accountId] += $signedCents;

        return [
            'type' => $type->value,
            'account_id' => $accountId,
            'amount_cents' => $signedCents,
            'date' => $date->toDateString(),
            'category_id' => null,
            'description' => null,
            'merchant' => null,
            'note' => null,
            'origin' => TransactionOrigin::Manual->value,
            'transfer_id' => null,
            'transfer_leg' => null,
            'adjustment_target_cents' => null,
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
            ...$attributes,
        ];
    }

    private function insertConfirmedCaptures(): void
    {
        $movements = DB::table('transactions')
            ->join('accounts', 'accounts.id', '=', 'transactions.account_id')
            ->where('accounts.name', 'like', self::PREFIX.' %')
            ->whereIn('transactions.origin', [TransactionOrigin::Voice->value, TransactionOrigin::Photo->value])
            ->orderByDesc('transactions.date')
            ->limit(self::CONFIRMED_CAPTURES)
            ->get(['transactions.id', 'transactions.origin', 'transactions.created_at']);

        foreach ($movements->chunk(self::CHUNK) as $chunk) {
            $captures = [];
            $drafts = [];

            foreach ($chunk as $movement) {
                $confirmedAt = CarbonImmutable::parse(is_string($movement->created_at) ? $movement->created_at : 'now');
                $startedAt = $confirmedAt->subSeconds(mt_rand(3, 25));
                $captureId = (string) Str::ulid();
                $origin = $movement->origin === TransactionOrigin::Photo->value ? 'photo' : 'voice';

                $captures[] = [
                    'id' => $captureId,
                    'kind' => $origin,
                    'status' => 'completed',
                    'client_started_at' => $startedAt,
                    'created_at' => $startedAt->addSeconds(2),
                    'updated_at' => $startedAt->addSeconds(2),
                ];

                $drafts[] = [
                    'origin' => $origin,
                    'status' => 'confirmed',
                    'capture_id' => $captureId,
                    'corrected_fields' => json_encode(mt_rand(1, 10) <= 8 ? [] : ['amount_cents']),
                    'transaction_id' => $movement->id,
                    'confirmed_at' => $confirmedAt,
                    'created_at' => $startedAt->addSeconds(2),
                    'updated_at' => $confirmedAt,
                ];
            }

            DB::table('captures')->insert($captures);
            DB::table('drafts')->insert($drafts);
        }
    }

    private static function date(mixed $value): CarbonImmutable
    {
        return $value instanceof CarbonImmutable ? $value : throw new RuntimeException('Expected a date.');
    }

    private static function integer(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }
}

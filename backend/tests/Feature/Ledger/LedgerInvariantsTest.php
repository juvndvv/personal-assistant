<?php

declare(strict_types=1);

use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Actions\Transactions\DeleteTransaction;
use App\Actions\Transactions\RegisterTransaction;
use App\Actions\Transactions\RestoreTransaction;
use App\Actions\Transactions\UpdateTransaction;
use App\Actions\Transfers\DeleteTransfer;
use App\Actions\Transfers\RegisterTransfer;
use App\Actions\Transfers\RestoreTransfer;
use App\Actions\Transfers\SettleCreditCard;
use App\Actions\Transfers\UpdateTransfer;
use App\Domain\Ledger\BalanceCalculator;
use App\Domain\Transactions\Changes;
use App\Enums\TransactionType;
use App\Enums\TransferKind;
use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class LedgerModel
{
    /** @var array<int, array{account: int, signed: int, live: bool, type: string}> */
    public array $rows = [];

    /** @var array<int, array{from: int, to: int, amount: int, live: bool, out: int, in: int}> */
    public array $transfers = [];

    /** @param array<int, int> $openings */
    public function __construct(public array $openings) {}

    public function track(Transaction $transaction): void
    {
        $this->rows[$transaction->id] = [
            'account' => $transaction->account_id,
            'signed' => $transaction->amount_cents,
            'live' => ! $transaction->trashed(),
            'type' => $transaction->type->value,
        ];
    }

    public function trackTransfer(Transfer $transfer): void
    {
        $legs = Transaction::withTrashed()->where('transfer_id', $transfer->id)->get();

        foreach ($legs as $leg) {
            $this->track($leg);
        }

        $this->transfers[$transfer->id] = [
            'from' => $transfer->from_account_id,
            'to' => $transfer->to_account_id,
            'amount' => $transfer->amount_cents,
            'live' => ! $transfer->trashed(),
            'out' => $legs->firstWhere('transfer_leg.value', 'out')->id,
            'in' => $legs->firstWhere('transfer_leg.value', 'in')->id,
        ];
    }

    /** @return array<int, int> */
    public function balances(): array
    {
        $balances = $this->openings;

        foreach ($this->rows as $row) {
            if ($row['live']) {
                $balances[$row['account']] += $row['signed'];
            }
        }

        return $balances;
    }

    /** @return list<int> */
    public function ids(string $type, bool $live): array
    {
        return array_keys(array_filter($this->rows, fn (array $row): bool => $row['type'] === $type && $row['live'] === $live));
    }

    /** @return list<int> */
    public function transferIds(bool $live): array
    {
        return array_keys(array_filter($this->transfers, fn (array $transfer): bool => $transfer['live'] === $live));
    }
}

function ledgerPick(array $items): mixed
{
    return $items[mt_rand(0, count($items) - 1)];
}

function ledgerRandomDay(): CarbonImmutable
{
    return day('2026-06-01')->addDays(mt_rand(0, 134));
}

function ledgerFlowCents(): int
{
    return (int) DB::table('transactions')
        ->whereNull('deleted_at')
        ->whereIn('type', ['expense', 'income', 'adjustment'])
        ->where('date', '<=', CarbonImmutable::today()->toDateString())
        ->sum('amount_cents');
}

function ledgerNetWorthCents(): int
{
    return array_sum(app(BalanceCalculator::class)->forAccounts());
}

it('keeps every ledger invariant over a seeded random sequence of 300 operations', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 12:00', 'Europe/Madrid'));
    mt_srand(20261013);

    $accounts = [
        Account::factory()->openedOn(day('2026-01-01'), 250_000)->create(),
        Account::factory()->openedOn(day('2026-01-01'), 40_000)->create(),
        Account::factory()->openedOn(day('2026-01-01'), 1_000_000)->create(),
        Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'), -15_000)->create(),
    ];
    $accountIds = array_map(fn (Account $account): int => $account->id, $accounts);
    $card = $accounts[3];
    $expenseCategories = Category::factory()->count(4)->create()->modelKeys();
    $incomeCategories = Category::factory()->income()->count(2)->create()->modelKeys();

    $model = new LedgerModel(array_combine($accountIds, array_map(fn (Account $account): int => $account->opening_balance_cents, $accounts)));

    $operations = [
        'register' => function () use ($model, $accountIds, $expenseCategories, $incomeCategories): string {
            $type = ledgerPick([TransactionType::Expense, TransactionType::Expense, TransactionType::Income]);
            $transaction = app(RegisterTransaction::class)->handle(
                type: $type,
                amountCents: mt_rand(1, 200_000),
                categoryId: ledgerPick($type === TransactionType::Expense ? $expenseCategories : $incomeCategories),
                date: ledgerRandomDay(),
                accountId: ledgerPick($accountIds),
                tags: mt_rand(0, 1) === 1 ? [ledgerPick(['casa', 'Viaje', 'trabajo'])] : [],
            );
            $model->track($transaction);

            return "register {$type->value} {$transaction->amount_cents}";
        },
        'update' => function () use ($model, $accountIds, $expenseCategories, $incomeCategories): string {
            $ids = [...$model->ids('expense', true), ...$model->ids('income', true)];

            if ($ids === []) {
                return 'update skipped';
            }

            $type = ledgerPick(['expense', 'income']);
            $transaction = app(UpdateTransaction::class)->handle(Transaction::query()->findOrFail(ledgerPick($ids)), new Changes([
                'type' => $type,
                'category_id' => ledgerPick($type === 'expense' ? $expenseCategories : $incomeCategories),
                'amount_cents' => mt_rand(1, 200_000),
                'account_id' => ledgerPick($accountIds),
                'date' => ledgerRandomDay()->toDateString(),
            ]));
            $model->track($transaction);

            return "update {$transaction->id}";
        },
        'delete' => function () use ($model): string {
            $ids = [...$model->ids('expense', true), ...$model->ids('income', true), ...$model->ids('adjustment', true)];

            if ($ids === []) {
                return 'delete skipped';
            }

            $id = ledgerPick($ids);
            app(DeleteTransaction::class)->handle(Transaction::query()->findOrFail($id));
            $model->rows[$id]['live'] = false;

            return "delete {$id}";
        },
        'restore' => function () use ($model): string {
            $ids = [...$model->ids('expense', false), ...$model->ids('income', false), ...$model->ids('adjustment', false)];

            if ($ids === []) {
                return 'restore skipped';
            }

            $transaction = app(RestoreTransaction::class)->handle(Transaction::withTrashed()->findOrFail(ledgerPick($ids)));
            $model->track($transaction);

            return "restore {$transaction->id}";
        },
        'transfer' => function () use ($model, $accountIds): string {
            $from = ledgerPick($accountIds);
            $to = ledgerPick(array_values(array_diff($accountIds, [$from])));
            $transfer = app(RegisterTransfer::class)->handle($from, $to, mt_rand(1, 100_000), ledgerRandomDay());
            $model->trackTransfer($transfer);

            return "transfer {$transfer->id}";
        },
        'settle' => function () use ($model, $accountIds, $card): string {
            $from = ledgerPick(array_values(array_diff($accountIds, [$card->id])));
            $transfer = app(SettleCreditCard::class)->handle($card->id, $from, mt_rand(1, 50_000), ledgerRandomDay());
            $model->trackTransfer($transfer);

            return "settle {$transfer->id}";
        },
        'update transfer' => function () use ($model, $accountIds): string {
            $ids = $model->transferIds(live: true);

            if ($ids === []) {
                return 'update transfer skipped';
            }

            $from = ledgerPick($accountIds);
            $to = ledgerPick(array_values(array_diff($accountIds, [$from])));
            $transfer = app(UpdateTransfer::class)->handle(Transfer::query()->findOrFail(ledgerPick($ids)), new Changes([
                'kind' => TransferKind::Transfer->value,
                'from_account_id' => $from,
                'to_account_id' => $to,
                'amount_cents' => mt_rand(1, 100_000),
                'date' => ledgerRandomDay()->toDateString(),
            ]));
            $model->trackTransfer($transfer);

            return "update transfer {$transfer->id}";
        },
        'delete transfer' => function () use ($model): string {
            $ids = $model->transferIds(live: true);

            if ($ids === []) {
                return 'delete transfer skipped';
            }

            $transfer = Transfer::query()->findOrFail(ledgerPick($ids));
            app(DeleteTransfer::class)->handle($transfer);
            $model->trackTransfer(Transfer::withTrashed()->findOrFail($transfer->id));

            return "delete transfer {$transfer->id}";
        },
        'restore transfer' => function () use ($model): string {
            $ids = $model->transferIds(live: false);

            if ($ids === []) {
                return 'restore transfer skipped';
            }

            $transfer = app(RestoreTransfer::class)->handle(Transfer::withTrashed()->findOrFail(ledgerPick($ids)));
            $model->trackTransfer($transfer);

            return "restore transfer {$transfer->id}";
        },
        'adjust' => function () use ($model, $accountIds): string {
            $account = Account::query()->findOrFail(ledgerPick($accountIds));
            $date = ledgerRandomDay();
            $target = mt_rand(-50_000, 1_500_000);
            $adjustment = app(RecordBalanceAdjustment::class)->handle($account, $date, $target);
            $model->track($adjustment);

            expect(app(BalanceCalculator::class)->forAccount($account->id, $date))->toBe($target);

            return "adjust {$adjustment->id}";
        },
        'update adjustment' => function () use ($model): string {
            $ids = $model->ids('adjustment', true);

            if ($ids === []) {
                return 'update adjustment skipped';
            }

            $date = ledgerRandomDay();
            $target = mt_rand(-50_000, 1_500_000);
            $adjustment = app(UpdateTransaction::class)->handle(Transaction::query()->findOrFail(ledgerPick($ids)), new Changes([
                'date' => $date->toDateString(),
                'target_balance_cents' => $target,
            ]));
            $model->track($adjustment);

            expect(app(BalanceCalculator::class)->forAccount($adjustment->account_id, $date))->toBe($target);

            return "update adjustment {$adjustment->id}";
        },
    ];

    $names = array_keys($operations);
    $executed = 0;

    for ($step = 1; $step <= 300; $step++) {
        $netWorthBefore = ledgerNetWorthCents();
        $flowBefore = ledgerFlowCents();
        $name = ledgerPick($names);

        try {
            $description = $operations[$name]();
            $executed++;
        } catch (ValidationException $exception) {
            $description = "{$name} rejected: ".implode(' ', array_keys($exception->errors()));
        }

        DB::statement('SET CONSTRAINTS ALL IMMEDIATE');
        DB::statement('SET CONSTRAINTS ALL DEFERRED');

        expect(ledgerNetWorthCents() - $netWorthBefore)
            ->toBe(ledgerFlowCents() - $flowBefore, "Step {$step} ({$description}) changed net worth by something other than income − expense + adjustments.")
            ->and(app(BalanceCalculator::class)->forAccounts())
            ->toEqual($model->balances(), "Step {$step} ({$description}) diverged from the independent balance model.")
            ->and((int) DB::table('transactions')->whereNull('deleted_at')->where('type', 'transfer')->sum('amount_cents'))
            ->toBe(0, "Step {$step} ({$description}) left unbalanced transfer legs.");

        $this->artisan('app:ledger:verify')->assertSuccessful();
    }

    expect($executed)->toBeGreaterThan(250)
        ->and(Transfer::withTrashed()->count())->toBeGreaterThan(10)
        ->and(Transaction::query()->where('type', 'adjustment')->count())->toBeGreaterThan(5);
});

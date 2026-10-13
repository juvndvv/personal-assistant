<?php

declare(strict_types=1);

namespace Tests\Support;

use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Assert;

final class RawLedger
{
    public const string OPENING_DATE = '2026-01-01';

    /**
     * @param  array<string, mixed>  $overrides
     */
    public static function account(array $overrides = []): int
    {
        static $sequence = 0;
        $sequence++;

        return self::insert('accounts', [
            'name' => "Account {$sequence} ".uniqid(),
            'type' => 'checking',
            'opening_balance_cents' => 0,
            'opening_date' => self::OPENING_DATE,
            'created_at' => now(),
            'updated_at' => now(),
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    public static function category(array $overrides = []): int
    {
        return self::insert('categories', [
            'kind' => 'expense',
            'name' => 'Category '.uniqid(),
            'created_at' => now(),
            'updated_at' => now(),
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    public static function transaction(array $overrides = []): int
    {
        return self::insert('transactions', [
            'type' => 'expense',
            'amount_cents' => -1000,
            'date' => '2026-03-01',
            'created_at' => now(),
            'updated_at' => now(),
            ...$overrides,
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    public static function transfer(int $fromAccountId, int $toAccountId, array $overrides = []): int
    {
        return self::insert('transfers', [
            'kind' => 'transfer',
            'from_account_id' => $fromAccountId,
            'to_account_id' => $toAccountId,
            'amount_cents' => 5000,
            'date' => '2026-03-01',
            'created_at' => now(),
            'updated_at' => now(),
            ...$overrides,
        ]);
    }

    /**
     * @return array{transfer: int, out: int, in: int}
     */
    public static function balancedTransfer(int $fromAccountId, int $toAccountId, int $amountCents = 5000, string $date = '2026-03-01', string $kind = 'transfer'): array
    {
        $transferId = self::transfer($fromAccountId, $toAccountId, ['amount_cents' => $amountCents, 'date' => $date, 'kind' => $kind]);

        return [
            'transfer' => $transferId,
            'out' => self::leg($transferId, 'out', $fromAccountId, -$amountCents, $date),
            'in' => self::leg($transferId, 'in', $toAccountId, $amountCents, $date),
        ];
    }

    public static function leg(int $transferId, string $leg, int $accountId, int $signedCents, string $date = '2026-03-01'): int
    {
        return self::transaction([
            'type' => 'transfer',
            'account_id' => $accountId,
            'amount_cents' => $signedCents,
            'date' => $date,
            'transfer_id' => $transferId,
            'transfer_leg' => $leg,
        ]);
    }

    public static function expectRejected(Closure $statements, string $expectedFragment): void
    {
        try {
            DB::transaction(function () use ($statements): void {
                $statements();
                DB::statement('SET CONSTRAINTS ALL IMMEDIATE');
            });
        } catch (QueryException $exception) {
            Assert::assertStringContainsString($expectedFragment, $exception->getMessage());

            return;
        }

        Assert::fail("Expected PostgreSQL to reject the statements with \"{$expectedFragment}\".");
    }

    public static function expectAccepted(Closure $statements): void
    {
        DB::transaction(function () use ($statements): void {
            $statements();
            DB::statement('SET CONSTRAINTS ALL IMMEDIATE');
        });

        Assert::assertTrue(true);
    }

    public static function withoutTriggers(Closure $statements): void
    {
        DB::statement('SET LOCAL session_replication_role = replica');

        try {
            $statements();
        } finally {
            DB::statement('SET LOCAL session_replication_role = origin');
        }
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private static function insert(string $table, array $values): int
    {
        $id = DB::table($table)->insertGetId($values);

        return is_numeric($id) ? (int) $id : throw new \RuntimeException("Insert into {$table} returned no id.");
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Ledger;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use stdClass;

final readonly class LedgerVerifier
{
    public function __construct(private BalanceCalculator $balances) {}

    /**
     * @return list<string>
     */
    public function violations(): array
    {
        return [
            ...$this->unbalancedTransfers(),
            ...$this->miscategorizedMovements(),
            ...$this->movementsBeforeOpening(),
            ...$this->balanceMismatches(),
            ...$this->danglingConfirmedDrafts(),
            ...$this->orphanAttachments(),
        ];
    }

    /**
     * @return list<string>
     */
    private function unbalancedTransfers(): array
    {
        $rows = DB::select(<<<'SQL'
            WITH leg_counts AS (
                SELECT t.id,
                    t.deleted_at IS NOT NULL AS deleted,
                    count(x.id) AS live_legs,
                    count(x.id) FILTER (
                        WHERE x.type = 'transfer'
                            AND x.date = t.date
                            AND (
                                (x.transfer_leg = 'out' AND x.account_id = t.from_account_id AND x.amount_cents = -t.amount_cents)
                                OR (x.transfer_leg = 'in' AND x.account_id = t.to_account_id AND x.amount_cents = t.amount_cents)
                            )
                    ) AS matching_legs
                FROM transfers t
                LEFT JOIN transactions x ON x.transfer_id = t.id AND x.deleted_at IS NULL
                GROUP BY t.id
            )
            SELECT id, deleted, live_legs, matching_legs
            FROM leg_counts
            WHERE (NOT deleted AND (live_legs <> 2 OR matching_legs <> 2))
                OR (deleted AND live_legs <> 0)
            ORDER BY id
            SQL);

        return array_values(array_map(
            fn (stdClass $row): string => sprintf(
                'Transfer %d%s has %d live legs, %d balanced.',
                self::integer($row->id),
                $row->deleted ? ' (deleted)' : '',
                self::integer($row->live_legs),
                self::integer($row->matching_legs),
            ),
            $rows,
        ));
    }

    /**
     * @return list<string>
     */
    private function miscategorizedMovements(): array
    {
        $rows = DB::select(<<<'SQL'
            SELECT x.id, x.type, x.category_id, c.kind AS category_kind
            FROM transactions x
            LEFT JOIN categories c ON c.id = x.category_id
            WHERE x.type IN ('expense', 'income')
                AND (c.id IS NULL OR c.kind <> x.type)
            ORDER BY x.id
            SQL);

        return array_values(array_map(
            fn (stdClass $row): string => sprintf(
                'Transaction %d (%s) has category %s of kind %s.',
                self::integer($row->id),
                self::text($row->type),
                $row->category_id === null ? 'none' : (string) self::integer($row->category_id),
                self::text($row->category_kind, 'none'),
            ),
            $rows,
        ));
    }

    /**
     * @return list<string>
     */
    private function movementsBeforeOpening(): array
    {
        $rows = DB::select(<<<'SQL'
            SELECT x.id, x.date, a.id AS account_id, a.opening_date
            FROM transactions x
            JOIN accounts a ON a.id = x.account_id
            WHERE x.deleted_at IS NULL AND x.date < a.opening_date
            ORDER BY x.id
            SQL);

        return array_values(array_map(
            fn (stdClass $row): string => sprintf(
                'Transaction %d dated %s precedes the opening date %s of account %d.',
                self::integer($row->id),
                self::text($row->date),
                self::text($row->opening_date),
                self::integer($row->account_id),
            ),
            $rows,
        ));
    }

    /**
     * @return list<string>
     */
    private function balanceMismatches(): array
    {
        $today = CarbonImmutable::today();
        $calculated = $this->balances->forAccounts($today);
        $rows = DB::select(<<<'SQL'
            SELECT a.id,
                a.opening_balance_cents + COALESCE((
                    SELECT sum(x.amount_cents)
                    FROM transactions x
                    WHERE x.account_id = a.id AND x.deleted_at IS NULL AND x.date <= ?
                ), 0) AS balance_cents
            FROM accounts a
            WHERE a.deleted_at IS NULL
            ORDER BY a.id
            SQL, [$today->toDateString()]);

        $violations = [];

        foreach ($rows as $row) {
            $accountId = self::integer($row->id);
            $expected = self::integer($row->balance_cents);
            $actual = $calculated[$accountId] ?? null;

            if ($actual !== $expected) {
                $violations[] = sprintf(
                    'Account %d balance is %s according to BalanceCalculator but %d according to the raw sum.',
                    $accountId,
                    $actual === null ? 'missing' : (string) $actual,
                    $expected,
                );
            }
        }

        return $violations;
    }

    /**
     * @return list<string>
     */
    private function danglingConfirmedDrafts(): array
    {
        $rows = DB::select(<<<'SQL'
            SELECT d.id
            FROM drafts d
            LEFT JOIN transactions x ON x.id = d.transaction_id
            LEFT JOIN transfers t ON t.id = d.transfer_id
            WHERE d.status = 'confirmed' AND x.id IS NULL AND t.id IS NULL
            ORDER BY d.id
            SQL);

        return array_values(array_map(
            fn (stdClass $row): string => sprintf(
                'Confirmed draft %d does not point to a ledger row.',
                self::integer($row->id),
            ),
            $rows,
        ));
    }

    /**
     * @return list<string>
     */
    private function orphanAttachments(): array
    {
        $rows = DB::select(<<<'SQL'
            SELECT a.id, a.capture_id
            FROM attachments a
            WHERE a.transaction_id IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM drafts d WHERE d.capture_id = a.capture_id AND d.status = 'pending'
                )
            ORDER BY a.id
            SQL);

        return array_values(array_map(
            fn (stdClass $row): string => sprintf(
                'Attachment %s has no movement and capture %s has no pending draft.',
                self::text($row->id),
                self::text($row->capture_id, 'none'),
            ),
            $rows,
        ));
    }

    private static function integer(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private static function text(mixed $value, string $fallback = ''): string
    {
        return is_string($value) ? $value : $fallback;
    }
}

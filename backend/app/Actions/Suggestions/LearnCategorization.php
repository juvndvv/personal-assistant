<?php

declare(strict_types=1);

namespace App\Actions\Suggestions;

use App\Domain\Text\HintKey;
use App\Enums\TransactionType;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class LearnCategorization
{
    public function handle(Transaction $transaction): void
    {
        if (! in_array($transaction->type, [TransactionType::Expense, TransactionType::Income], true)
            || $transaction->category_id === null) {
            return;
        }

        $key = HintKey::forMovement($transaction->merchant, $transaction->description);

        if ($key === null) {
            return;
        }

        $now = CarbonImmutable::now();

        DB::statement(<<<'SQL'
            INSERT INTO categorization_hints (kind, key, category_id, account_id, hits, last_used_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT (kind, key) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                account_id = EXCLUDED.account_id,
                hits = categorization_hints.hits + 1,
                last_used_at = EXCLUDED.last_used_at,
                updated_at = EXCLUDED.updated_at
            SQL, [
            $transaction->type->value,
            $key,
            $transaction->category_id,
            $transaction->account_id,
            $now,
            $now,
            $now,
        ]);
    }
}

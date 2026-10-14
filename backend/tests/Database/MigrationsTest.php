<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * @return list<Migration>
 */
function ledgerMigrations(): array
{
    $files = glob(database_path('migrations/2026_10_14_*.php')) ?: [];
    sort($files);

    return array_map(fn (string $file): Migration => require $file, $files);
}

it('rolls the ledger migrations back and forth on the same connection', function (): void {
    $ledgerTables = ['settings', 'accounts', 'categories', 'transfers', 'transactions', 'tags', 'tag_transaction', 'captures', 'drafts', 'attachments', 'recurring_templates', 'recurring_occurrences', 'budgets'];
    $migrations = ledgerMigrations();

    foreach (array_reverse($migrations) as $migration) {
        $migration->down();
    }

    foreach ($ledgerTables as $table) {
        expect(Schema::hasTable($table))->toBeFalse("{$table} should be dropped");
    }

    foreach ($migrations as $migration) {
        $migration->up();
    }

    foreach ($ledgerTables as $table) {
        expect(Schema::hasTable($table))->toBeTrue("{$table} should exist");
    }
});

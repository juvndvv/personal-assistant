<?php

declare(strict_types=1);

use App\Enums\AccountType;
use App\Enums\CategoryKind;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Enums\TransferKind;
use App\Enums\TransferLeg;
use Illuminate\Support\Facades\DB;

/**
 * @return list<string>
 */
function checkConstraintValues(string $constraint): array
{
    $definition = DB::table('pg_constraint')
        ->where('conname', $constraint)
        ->where('contype', 'c')
        ->selectRaw('pg_get_constraintdef(oid) AS definition')
        ->value('definition');

    expect($definition)->toBeString("Missing CHECK constraint {$constraint}");

    preg_match_all("/'([^']*)'::/", (string) $definition, $matches);

    $values = $matches[1];
    sort($values);

    return $values;
}

it('mirrors every enum case in its CHECK constraint', function (string $enum, string $constraint): void {
    $cases = array_map(fn (BackedEnum $case): string => (string) $case->value, $enum::cases());
    sort($cases);

    expect(checkConstraintValues($constraint))->toBe($cases);
})->with([
    'account type' => [AccountType::class, 'accounts_type_check'],
    'category kind' => [CategoryKind::class, 'categories_kind_check'],
    'transaction type' => [TransactionType::class, 'transactions_type_check'],
    'transaction origin' => [TransactionOrigin::class, 'transactions_origin_check'],
    'transfer kind' => [TransferKind::class, 'transfers_kind_check'],
    'transfer leg' => [TransferLeg::class, 'transactions_transfer_leg_check'],
]);

<?php

declare(strict_types=1);

use App\Enums\AccountType;
use App\Enums\AttachmentKind;
use App\Enums\CaptureKind;
use App\Enums\CaptureStatus;
use App\Enums\CategoryKind;
use App\Enums\DraftOrigin;
use App\Enums\DraftStatus;
use App\Enums\DraftType;
use App\Enums\OccurrenceStatus;
use App\Enums\RecurringFrequency;
use App\Enums\RecurringType;
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
    'categorization hint kind' => [CategoryKind::class, 'categorization_hints_kind_check'],
    'transaction type' => [TransactionType::class, 'transactions_type_check'],
    'transaction origin' => [TransactionOrigin::class, 'transactions_origin_check'],
    'transfer kind' => [TransferKind::class, 'transfers_kind_check'],
    'transfer leg' => [TransferLeg::class, 'transactions_transfer_leg_check'],
    'capture kind' => [CaptureKind::class, 'captures_kind_check'],
    'capture status' => [CaptureStatus::class, 'captures_status_check'],
    'draft origin' => [DraftOrigin::class, 'drafts_origin_check'],
    'draft status' => [DraftStatus::class, 'drafts_status_check'],
    'draft type' => [DraftType::class, 'drafts_type_check'],
    'attachment kind' => [AttachmentKind::class, 'attachments_kind_check'],
    'recurring frequency' => [RecurringFrequency::class, 'recurring_templates_frequency_check'],
    'recurring type' => [RecurringType::class, 'recurring_templates_type_check'],
    'occurrence status' => [OccurrenceStatus::class, 'recurring_occurrences_status_check'],
]);

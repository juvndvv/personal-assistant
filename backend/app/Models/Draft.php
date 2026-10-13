<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\DraftOrigin;
use App\Enums\DraftStatus;
use App\Enums\DraftType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property DraftOrigin $origin
 * @property DraftStatus $status
 * @property string|null $capture_id
 * @property int|null $recurring_occurrence_id
 * @property DraftType|null $type
 * @property int|null $amount_cents
 * @property CarbonImmutable|null $date
 * @property int|null $account_id
 * @property int|null $to_account_id
 * @property int|null $category_id
 * @property string|null $description
 * @property string|null $merchant
 * @property array<string, float|int> $confidence
 * @property array<string, string> $field_sources
 * @property list<string> $low_confidence_fields
 * @property list<string>|null $corrected_fields
 * @property int|null $transaction_id
 * @property int|null $transfer_id
 * @property CarbonImmutable|null $confirmed_at
 * @property CarbonImmutable|null $discarded_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read Capture|null $capture
 * @property-read RecurringOccurrence|null $recurringOccurrence
 */
final class Draft extends Model
{
    public const array PROPOSAL_FIELDS = [
        'type', 'amount_cents', 'date', 'account_id', 'to_account_id', 'category_id', 'description', 'merchant',
    ];

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'pending',
        'confidence' => '{}',
        'field_sources' => '{}',
        'low_confidence_fields' => '[]',
    ];

    public function isPending(): bool
    {
        return $this->status === DraftStatus::Pending;
    }

    /**
     * @return array<string, int|string|null>
     */
    public function proposal(): array
    {
        return [
            'type' => $this->type?->value,
            'amount_cents' => $this->amount_cents,
            'date' => $this->date?->toDateString(),
            'account_id' => $this->account_id,
            'to_account_id' => $this->to_account_id,
            'category_id' => $this->category_id,
            'description' => $this->description,
            'merchant' => $this->merchant,
        ];
    }

    /**
     * @return BelongsTo<Capture, $this>
     */
    public function capture(): BelongsTo
    {
        return $this->belongsTo(Capture::class);
    }

    /**
     * @return BelongsTo<RecurringOccurrence, $this>
     */
    public function recurringOccurrence(): BelongsTo
    {
        return $this->belongsTo(RecurringOccurrence::class);
    }

    /**
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function pending(Builder $query): void
    {
        $query->where('status', DraftStatus::Pending->value);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'origin' => DraftOrigin::class,
            'status' => DraftStatus::class,
            'type' => DraftType::class,
            'amount_cents' => 'integer',
            'date' => 'immutable_date',
            'account_id' => 'integer',
            'to_account_id' => 'integer',
            'category_id' => 'integer',
            'confidence' => 'array',
            'field_sources' => 'array',
            'low_confidence_fields' => 'array',
            'corrected_fields' => 'array',
            'recurring_occurrence_id' => 'integer',
            'transaction_id' => 'integer',
            'transfer_id' => 'integer',
            'confirmed_at' => 'immutable_datetime',
            'discarded_at' => 'immutable_datetime',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}

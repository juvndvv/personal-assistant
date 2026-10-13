<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Enums\TransferLeg;
use Carbon\CarbonImmutable;
use Database\Factories\TransactionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * @property int $id
 * @property TransactionType $type
 * @property int $account_id
 * @property int $amount_cents
 * @property CarbonImmutable $date
 * @property int|null $category_id
 * @property string|null $category_kind
 * @property string|null $description
 * @property string|null $merchant
 * @property string|null $note
 * @property TransactionOrigin $origin
 * @property int|null $transfer_id
 * @property TransferLeg|null $transfer_leg
 * @property int|null $adjustment_target_cents
 * @property int|null $recurring_occurrence_id
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property CarbonImmutable|null $deleted_at
 * @property-read Account $account
 * @property-read Category|null $category
 * @property-read Transfer|null $transfer
 * @property-read RecurringOccurrence|null $recurringOccurrence
 * @property-read Collection<int, Tag> $tags
 * @property-read Collection<int, Attachment> $attachments
 * @property-read int|null $attachments_count
 */
#[Fillable([
    'type', 'account_id', 'amount_cents', 'date', 'category_id', 'description', 'merchant', 'note',
    'origin', 'transfer_id', 'transfer_leg', 'adjustment_target_cents',
])]
final class Transaction extends Model
{
    /** @use HasFactory<TransactionFactory> */
    use HasFactory;

    use SoftDeletes;

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'origin' => 'manual',
    ];

    /**
     * @return BelongsTo<Account, $this>
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class)->withTrashed();
    }

    /**
     * @return BelongsTo<Category, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * @return BelongsTo<Transfer, $this>
     */
    public function transfer(): BelongsTo
    {
        return $this->belongsTo(Transfer::class)->withTrashed();
    }

    /**
     * @return BelongsTo<RecurringOccurrence, $this>
     */
    public function recurringOccurrence(): BelongsTo
    {
        return $this->belongsTo(RecurringOccurrence::class);
    }

    /**
     * @return BelongsToMany<Tag, $this>
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class);
    }

    /**
     * @return HasMany<Attachment, $this>
     */
    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    /**
     * @return Builder<Attachment>
     */
    public function receipts(): Builder
    {
        return Attachment::query()->whereIn(
            'transaction_id',
            $this->transfer_id === null
                ? [$this->id]
                : self::withTrashed()->where('transfer_id', $this->transfer_id)->select('id'),
        );
    }

    public function loadReceiptsCount(): self
    {
        $this->setAttribute('attachments_count', $this->receipts()->count());

        return $this;
    }

    public static function correlatedReceipts(): QueryBuilder
    {
        return DB::table('attachments')->where(function (QueryBuilder $owners): void {
            $owners->whereColumn('attachments.transaction_id', 'transactions.id')
                ->orWhereIn('attachments.transaction_id', function (QueryBuilder $legs): void {
                    $legs->select('transfer_legs.id')
                        ->from('transactions', 'transfer_legs')
                        ->whereNotNull('transactions.transfer_id')
                        ->whereColumn('transfer_legs.transfer_id', 'transactions.transfer_id');
                });
        });
    }

    public function magnitudeCents(): int
    {
        return abs($this->amount_cents);
    }

    /**
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function reportable(Builder $query): void
    {
        $query->whereIn('type', [TransactionType::Expense->value, TransactionType::Income->value]);
    }

    /**
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function withReceiptsCount(Builder $query): void
    {
        if ($query->getQuery()->columns === null) {
            $query->select('transactions.*');
        }

        $query->selectSub(self::correlatedReceipts()->selectRaw('count(*)'), 'attachments_count');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => TransactionType::class,
            'account_id' => 'integer',
            'amount_cents' => 'integer',
            'date' => 'immutable_date',
            'category_id' => 'integer',
            'origin' => TransactionOrigin::class,
            'transfer_id' => 'integer',
            'transfer_leg' => TransferLeg::class,
            'adjustment_target_cents' => 'integer',
            'recurring_occurrence_id' => 'integer',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
            'deleted_at' => 'immutable_datetime',
        ];
    }
}

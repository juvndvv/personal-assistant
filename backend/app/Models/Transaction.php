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
use Illuminate\Database\Eloquent\SoftDeletes;

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
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property CarbonImmutable|null $deleted_at
 * @property-read Account $account
 * @property-read Category|null $category
 * @property-read Transfer|null $transfer
 * @property-read Collection<int, Tag> $tags
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
     * @return BelongsToMany<Tag, $this>
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class);
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
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
            'deleted_at' => 'immutable_datetime',
        ];
    }
}

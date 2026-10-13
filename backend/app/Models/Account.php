<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AccountType;
use Carbon\CarbonImmutable;
use Database\Factories\AccountFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property string $name
 * @property AccountType $type
 * @property int $opening_balance_cents
 * @property CarbonImmutable $opening_date
 * @property int|null $statement_day
 * @property int|null $settlement_account_id
 * @property int $sort_order
 * @property CarbonImmutable|null $archived_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property CarbonImmutable|null $deleted_at
 */
#[Fillable(['name', 'type', 'opening_balance_cents', 'opening_date', 'statement_day', 'settlement_account_id', 'sort_order', 'archived_at'])]
final class Account extends Model
{
    /** @use HasFactory<AccountFactory> */
    use HasFactory;

    use SoftDeletes;

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    public function hasMovements(): bool
    {
        return $this->transactions()->exists();
    }

    /**
     * @return HasMany<Transaction, $this>
     */
    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function settlementAccount(): BelongsTo
    {
        return $this->belongsTo(self::class, 'settlement_account_id');
    }

    /**
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function active(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /**
     * @param  Builder<self>  $query
     */
    #[Scope]
    protected function ordered(Builder $query): void
    {
        $query->orderByRaw(
            "CASE type WHEN 'checking' THEN 0 WHEN 'credit_card' THEN 1 WHEN 'cash' THEN 2 WHEN 'savings_investment' THEN 3 END",
        )->orderBy('sort_order')->orderByRaw('lower(name)')->orderBy('id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => AccountType::class,
            'opening_balance_cents' => 'integer',
            'opening_date' => 'immutable_date',
            'statement_day' => 'integer',
            'settlement_account_id' => 'integer',
            'sort_order' => 'integer',
            'archived_at' => 'immutable_datetime',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
            'deleted_at' => 'immutable_datetime',
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TransferKind;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property TransferKind $kind
 * @property int $from_account_id
 * @property int $to_account_id
 * @property int $amount_cents
 * @property CarbonImmutable $date
 * @property string|null $note
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property CarbonImmutable|null $deleted_at
 * @property-read Account $fromAccount
 * @property-read Account $toAccount
 * @property-read Collection<int, Transaction> $legs
 */
#[Fillable(['kind', 'from_account_id', 'to_account_id', 'amount_cents', 'date', 'note'])]
final class Transfer extends Model
{
    use SoftDeletes;

    /**
     * @return BelongsTo<Account, $this>
     */
    public function fromAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'from_account_id')->withTrashed();
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function toAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'to_account_id')->withTrashed();
    }

    /**
     * @return HasMany<Transaction, $this>
     */
    public function legs(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => TransferKind::class,
            'from_account_id' => 'integer',
            'to_account_id' => 'integer',
            'amount_cents' => 'integer',
            'date' => 'immutable_date',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
            'deleted_at' => 'immutable_datetime',
        ];
    }
}

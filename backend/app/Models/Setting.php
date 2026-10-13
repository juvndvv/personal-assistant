<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\WithoutIncrementing;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $month_start_day
 * @property int|null $default_account_id
 * @property int|null $last_used_account_id
 * @property int $orphan_draft_ttl_days
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
#[Fillable(['month_start_day', 'default_account_id', 'last_used_account_id', 'orphan_draft_ttl_days'])]
#[WithoutIncrementing]
final class Setting extends Model
{
    public const int SINGLETON_ID = 1;

    public static function current(): self
    {
        return self::query()->findOrFail(self::SINGLETON_ID);
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function defaultAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'default_account_id');
    }

    /**
     * @return BelongsTo<Account, $this>
     */
    public function lastUsedAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'last_used_account_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'id' => 'integer',
            'month_start_day' => 'integer',
            'default_account_id' => 'integer',
            'last_used_account_id' => 'integer',
            'orphan_draft_ttl_days' => 'integer',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}

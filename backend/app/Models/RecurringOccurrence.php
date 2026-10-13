<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OccurrenceStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property int $id
 * @property int $template_id
 * @property string $slot_month
 * @property CarbonImmutable $due_date
 * @property OccurrenceStatus $status
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read RecurringTemplate $template
 * @property-read Transaction|null $transaction
 * @property-read Draft|null $draft
 */
final class RecurringOccurrence extends Model
{
    /**
     * @return BelongsTo<RecurringTemplate, $this>
     */
    public function template(): BelongsTo
    {
        return $this->belongsTo(RecurringTemplate::class, 'template_id')->withTrashed();
    }

    /**
     * @return HasOne<Transaction, $this>
     */
    public function transaction(): HasOne
    {
        return $this->hasOne(Transaction::class)->withTrashed();
    }

    /**
     * @return HasOne<Draft, $this>
     */
    public function draft(): HasOne
    {
        return $this->hasOne(Draft::class);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'template_id' => 'integer',
            'due_date' => 'immutable_date',
            'status' => OccurrenceStatus::class,
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}

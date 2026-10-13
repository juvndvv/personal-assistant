<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Recurring\RecurrenceSchedule;
use App\Enums\RecurringFrequency;
use App\Enums\RecurringType;
use Carbon\CarbonImmutable;
use Database\Factories\RecurringTemplateFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property string $name
 * @property RecurringType $type
 * @property int $amount_cents
 * @property bool $is_variable
 * @property int $account_id
 * @property int $category_id
 * @property string|null $category_kind
 * @property RecurringFrequency $frequency
 * @property int $day_of_month
 * @property CarbonImmutable $starts_on
 * @property CarbonImmutable|null $ends_on
 * @property CarbonImmutable|null $generate_from
 * @property string|null $description
 * @property string|null $merchant
 * @property string|null $note
 * @property CarbonImmutable|null $paused_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property CarbonImmutable|null $deleted_at
 * @property-read Account $account
 * @property-read Category $category
 */
#[Fillable([
    'name', 'type', 'amount_cents', 'is_variable', 'account_id', 'category_id', 'frequency', 'day_of_month',
    'starts_on', 'ends_on', 'description', 'merchant', 'note',
])]
final class RecurringTemplate extends Model
{
    /** @use HasFactory<RecurringTemplateFactory> */
    use HasFactory;

    use SoftDeletes;

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'is_variable' => false,
    ];

    public function schedule(): RecurrenceSchedule
    {
        return new RecurrenceSchedule($this->frequency, $this->day_of_month, $this->starts_on, $this->ends_on);
    }

    public function nextDueDate(CarbonImmutable $today): ?CarbonImmutable
    {
        if ($this->isPaused()) {
            return null;
        }

        $from = self::latest($today, $this->generationStartsOn());

        return $this->schedule()->nextDueDate($from, $this->generatedSlotMonths(from: $from->format('Y-m')));
    }

    public function generationStartsOn(): CarbonImmutable
    {
        return self::latest($this->starts_on, $this->generate_from, $this->account->opening_date);
    }

    public function stopBackfillBefore(CarbonImmutable $today): void
    {
        $this->generate_from = self::latest($today->startOfMonth(), $this->generate_from);
    }

    /**
     * @return list<string>
     */
    public function generatedSlotMonths(?string $from = null): array
    {
        return array_values($this->occurrences()
            ->when($from !== null, fn ($query) => $query->where('slot_month', '>=', $from))
            ->orderBy('slot_month')
            ->get(['slot_month'])
            ->map(fn (RecurringOccurrence $occurrence): string => $occurrence->slot_month)
            ->all());
    }

    public function hasOccurrences(): bool
    {
        return $this->occurrences()->exists();
    }

    public function isPaused(): bool
    {
        return $this->paused_at !== null;
    }

    public function pausedOn(): ?CarbonImmutable
    {
        return $this->paused_at?->setTimezone(CarbonImmutable::now()->getTimezone())->startOfDay();
    }

    public function movementDescription(): string
    {
        return $this->description ?? $this->name;
    }

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
     * @return HasMany<RecurringOccurrence, $this>
     */
    public function occurrences(): HasMany
    {
        return $this->hasMany(RecurringOccurrence::class, 'template_id');
    }

    private static function latest(CarbonImmutable $date, ?CarbonImmutable ...$others): CarbonImmutable
    {
        foreach ($others as $other) {
            if ($other !== null && $other->greaterThan($date)) {
                $date = $other;
            }
        }

        return $date->startOfDay();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => RecurringType::class,
            'amount_cents' => 'integer',
            'is_variable' => 'boolean',
            'account_id' => 'integer',
            'category_id' => 'integer',
            'frequency' => RecurringFrequency::class,
            'day_of_month' => 'integer',
            'starts_on' => 'immutable_date',
            'ends_on' => 'immutable_date',
            'generate_from' => 'immutable_date',
            'paused_at' => 'immutable_datetime',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
            'deleted_at' => 'immutable_datetime',
        ];
    }
}

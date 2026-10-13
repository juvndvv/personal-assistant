<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\CaptureKind;
use App\Enums\CaptureStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property CaptureKind $kind
 * @property CaptureStatus $status
 * @property string|null $transcript
 * @property array<string, mixed>|null $raw_extraction
 * @property string|null $error
 * @property string|null $provider
 * @property string|null $model
 * @property int|null $transcription_ms
 * @property int|null $extraction_ms
 * @property CarbonImmutable|null $client_started_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read Collection<int, Attachment> $attachments
 * @property-read Draft|null $draft
 */
final class Capture extends Model
{
    use HasUlids;

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'processing',
    ];

    /**
     * @return HasMany<Attachment, $this>
     */
    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
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
            'kind' => CaptureKind::class,
            'status' => CaptureStatus::class,
            'raw_extraction' => 'array',
            'transcription_ms' => 'integer',
            'extraction_ms' => 'integer',
            'client_started_at' => 'immutable_datetime',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}

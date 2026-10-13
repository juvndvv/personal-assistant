<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AttachmentKind;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string|null $capture_id
 * @property int|null $transaction_id
 * @property AttachmentKind $kind
 * @property string $disk
 * @property string $path
 * @property string $mime
 * @property int $size_bytes
 * @property string $sha256
 * @property string|null $original_name
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read Capture|null $capture
 * @property-read Transaction|null $transaction
 */
final class Attachment extends Model
{
    use HasUlids;

    public const string DISK = 'receipts';

    public function downloadName(): string
    {
        return $this->original_name ?? basename($this->path);
    }

    /**
     * @return BelongsTo<Capture, $this>
     */
    public function capture(): BelongsTo
    {
        return $this->belongsTo(Capture::class);
    }

    /**
     * @return BelongsTo<Transaction, $this>
     */
    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class)->withTrashed();
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => AttachmentKind::class,
            'transaction_id' => 'integer',
            'size_bytes' => 'integer',
            'created_at' => 'immutable_datetime',
            'updated_at' => 'immutable_datetime',
        ];
    }
}

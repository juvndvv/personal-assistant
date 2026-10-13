<?php

declare(strict_types=1);

namespace App\Actions\Drafts;

use App\Actions\Attachments\StoreReceiptFile;
use App\Enums\DraftStatus;
use App\Models\Attachment;
use App\Models\Draft;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

final class DiscardDraft
{
    public function handle(Draft $draft): Draft
    {
        /** @var array{Draft, Collection<int, Attachment>} $outcome */
        $outcome = DB::transaction(function () use ($draft): array {
            $locked = Draft::query()->lockForUpdate()->findOrFail($draft->id);

            if (! $locked->isPending()) {
                throw ConfirmDraft::notPending();
            }

            $attachments = $locked->capture_id === null
                ? new Collection
                : Attachment::query()->where('capture_id', $locked->capture_id)->whereNull('transaction_id')->get();

            Attachment::query()->whereKey($attachments->modelKeys())->delete();

            $locked->status = DraftStatus::Discarded;
            $locked->discarded_at = CarbonImmutable::now();
            $locked->save();

            return [$locked, $attachments];
        });

        [$discarded, $attachments] = $outcome;

        foreach ($attachments as $attachment) {
            StoreReceiptFile::deleteFile($attachment);
        }

        return $discarded;
    }
}

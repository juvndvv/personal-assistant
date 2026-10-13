<?php

declare(strict_types=1);

namespace App\Actions\Drafts;

use App\Actions\Attachments\StoreReceiptFile;
use App\Exceptions\DomainConflict;
use App\Models\Attachment;
use App\Models\Capture;
use App\Models\Draft;
use App\Models\Setting;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class PurgeOrphanDrafts
{
    public function __construct(private DiscardDraft $discardDraft) {}

    public function handle(?CarbonImmutable $now = null): int
    {
        $cutoff = ($now ?? CarbonImmutable::now())->subDays(Setting::current()->orphan_draft_ttl_days);
        $purged = 0;

        $orphans = Draft::query()
            ->pending()
            ->whereNotNull('capture_id')
            ->where('created_at', '<', $cutoff)
            ->orderBy('id')
            ->get();

        foreach ($orphans as $draft) {
            try {
                $this->discardDraft->handle($draft);
                $purged++;
            } catch (DomainConflict) {
                continue;
            }
        }

        return $purged + $this->purgeCapturesWithoutDraft($cutoff);
    }

    private function purgeCapturesWithoutDraft(CarbonImmutable $cutoff): int
    {
        $captures = Capture::query()
            ->whereDoesntHave('draft')
            ->where('created_at', '<', $cutoff)
            ->get();

        foreach ($captures as $capture) {
            $attachments = DB::transaction(function () use ($capture) {
                $attachments = Attachment::query()
                    ->where('capture_id', $capture->id)
                    ->whereNull('transaction_id')
                    ->get();

                Attachment::query()->whereKey($attachments->modelKeys())->delete();
                $capture->delete();

                return $attachments;
            });

            foreach ($attachments as $attachment) {
                StoreReceiptFile::deleteFile($attachment);
            }
        }

        return $captures->count();
    }
}

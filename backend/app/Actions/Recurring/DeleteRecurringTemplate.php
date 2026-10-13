<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Actions\Drafts\DiscardDraft;
use App\Models\Draft;
use App\Models\RecurringTemplate;
use Illuminate\Support\Facades\DB;

final readonly class DeleteRecurringTemplate
{
    public function __construct(private DiscardDraft $discardDraft) {}

    public function handle(RecurringTemplate $template): void
    {
        DB::transaction(function () use ($template): void {
            $template = RecurringTemplate::query()->lockForUpdate()->findOrFail($template->id);

            $pendingDrafts = Draft::query()
                ->pending()
                ->whereIn('recurring_occurrence_id', $template->occurrences()->select('id'))
                ->get();

            foreach ($pendingDrafts as $draft) {
                $this->discardDraft->handle($draft);
            }

            $template->delete();
        });
    }
}

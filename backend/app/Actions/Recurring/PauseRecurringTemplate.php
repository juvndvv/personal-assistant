<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class PauseRecurringTemplate
{
    public function handle(RecurringTemplate $template): RecurringTemplate
    {
        return DB::transaction(function () use ($template): RecurringTemplate {
            $template = RecurringTemplate::query()->lockForUpdate()->findOrFail($template->id);

            if (! $template->isPaused()) {
                $template->paused_at = CarbonImmutable::now();
                $template->save();
            }

            return $template;
        });
    }
}

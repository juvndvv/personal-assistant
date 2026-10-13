<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Enums\OccurrenceStatus;
use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class ResumeRecurringTemplate
{
    public function __construct(private GenerateRecurringTransactions $generator) {}

    public function handle(RecurringTemplate $template): RecurringTemplate
    {
        return DB::transaction(function () use ($template): RecurringTemplate {
            $template = RecurringTemplate::query()->lockForUpdate()->findOrFail($template->id);
            $pausedOn = $template->pausedOn();

            if ($pausedOn === null) {
                return $template;
            }

            $yesterday = CarbonImmutable::today()->subDay();

            foreach ($template->schedule()->slotsBetween($pausedOn, $yesterday) as $slot) {
                $this->generator->generateSlot($template, $slot, OccurrenceStatus::Skipped);
            }

            $template->paused_at = null;
            $template->save();

            return $template;
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Domain\Period\Period;
use App\Domain\Recurring\Forecast;
use App\Domain\Recurring\ForecastItem;
use App\Domain\Recurring\OccurrenceEligibility;
use App\Enums\DraftStatus;
use App\Enums\ForecastStatus;
use App\Enums\OccurrenceStatus;
use App\Enums\RecurringType;
use App\Models\RecurringOccurrence;
use App\Models\RecurringTemplate;

final class RecurringForecast
{
    public function handle(Period $period): Forecast
    {
        $items = [
            ...$this->generatedItems($period),
            ...$this->upcomingItems($period),
        ];

        usort($items, fn (ForecastItem $a, ForecastItem $b): int => [$a->dueDate->toDateString(), $a->templateId]
            <=> [$b->dueDate->toDateString(), $b->templateId]);

        return new Forecast($period, $items);
    }

    /**
     * @return list<ForecastItem>
     */
    private function generatedItems(Period $period): array
    {
        $occurrences = RecurringOccurrence::query()
            ->with(['template', 'transaction', 'draft'])
            ->whereBetween('due_date', [$period->start->toDateString(), $period->end->toDateString()])
            ->get();

        return array_values($occurrences->map(fn (RecurringOccurrence $occurrence): ForecastItem => $this->generatedItem($occurrence))->all());
    }

    private function generatedItem(RecurringOccurrence $occurrence): ForecastItem
    {
        $template = $occurrence->template;
        $transaction = $occurrence->transaction;
        $draft = $occurrence->draft;
        $item = fn (ForecastStatus $status, ?RecurringType $type = null, ?int $amountCents = null, ?int $draftId = null, ?int $transactionId = null): ForecastItem => new ForecastItem(
            templateId: $template->id,
            templateName: $template->name,
            type: $type ?? $template->type,
            dueDate: $occurrence->due_date,
            amountCents: $amountCents ?? $template->amount_cents,
            isVariable: $template->is_variable,
            status: $status,
            draftId: $draftId,
            transactionId: $transactionId,
        );

        return match (true) {
            $occurrence->status === OccurrenceStatus::Posted && $transaction !== null && ! $transaction->trashed() => $item(
                ForecastStatus::Posted,
                RecurringType::tryFrom($transaction->type->value),
                $transaction->magnitudeCents(),
                transactionId: $transaction->id,
            ),
            $occurrence->status === OccurrenceStatus::AwaitingAmount && $draft?->status === DraftStatus::Pending => $item(
                ForecastStatus::AwaitingAmount,
                draftId: $draft->id,
            ),
            default => $item(ForecastStatus::Skipped),
        };
    }

    /**
     * @return list<ForecastItem>
     */
    private function upcomingItems(Period $period): array
    {
        $templates = RecurringTemplate::query()->with('account')->get();
        $candidates = [];

        foreach ($templates as $template) {
            $from = $period->start->max($template->generationStartsOn());

            foreach ($template->schedule()->slotsBetween($from, $period->end) as $slot) {
                $candidates[] = [$template, $slot];
            }
        }

        if ($candidates === []) {
            return [];
        }

        $generated = RecurringOccurrence::query()
            ->whereIn('template_id', $templates->modelKeys())
            ->whereIn('slot_month', array_unique(array_map(fn (array $candidate): string => $candidate[1]->slotMonth, $candidates)))
            ->get(['template_id', 'slot_month'])
            ->mapWithKeys(fn (RecurringOccurrence $occurrence): array => [$occurrence->template_id.'|'.$occurrence->slot_month => true])
            ->all();

        $items = [];

        foreach ($candidates as [$template, $slot]) {
            if (isset($generated[$template->id.'|'.$slot->slotMonth])) {
                continue;
            }

            $items[] = new ForecastItem(
                templateId: $template->id,
                templateName: $template->name,
                type: $template->type,
                dueDate: $slot->dueDate,
                amountCents: $template->amount_cents,
                isVariable: $template->is_variable,
                status: OccurrenceEligibility::isSkipped($template, $template->account, $slot->dueDate)
                    ? ForecastStatus::Skipped
                    : ForecastStatus::Upcoming,
            );
        }

        return $items;
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final readonly class UpdateRecurringTemplate
{
    private const array SCHEDULE_FIELDS = ['frequency', 'day_of_month', 'starts_on', 'ends_on', 'account_id'];

    public function __construct(private RecurringTemplateRules $rules) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(RecurringTemplate $template, array $attributes): RecurringTemplate
    {
        return DB::transaction(function () use ($template, $attributes): RecurringTemplate {
            $template = RecurringTemplate::query()->lockForUpdate()->findOrFail($template->id);
            $template->fill($attributes);

            if ($template->isDirty('type') && $template->hasOccurrences()) {
                throw ValidationException::withMessages([
                    'type' => 'No se puede cambiar el tipo de un fijo que ya ha generado movimientos.',
                ]);
            }

            $this->rules->handle(
                $template,
                checkAccount: $template->isDirty('account_id'),
                checkCategory: $template->isDirty(['category_id', 'type']),
            );

            if ($template->isDirty(self::SCHEDULE_FIELDS) && $template->hasOccurrences()) {
                $template->stopBackfillBefore(CarbonImmutable::today());
            }

            $template->save();

            return $template;
        });
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class CreateRecurringTemplate
{
    public function __construct(private RecurringTemplateRules $rules) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(array $attributes): RecurringTemplate
    {
        return DB::transaction(function () use ($attributes): RecurringTemplate {
            $template = new RecurringTemplate;
            $template->fill($attributes);
            $template->starts_on ??= CarbonImmutable::today();

            $this->rules->handle($template);
            $template->save();

            return $template;
        });
    }
}

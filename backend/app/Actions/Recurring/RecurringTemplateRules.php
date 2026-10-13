<?php

declare(strict_types=1);

namespace App\Actions\Recurring;

use App\Domain\Ledger\MovementRules;
use App\Models\RecurringTemplate;
use Illuminate\Validation\ValidationException;

final readonly class RecurringTemplateRules
{
    public function __construct(private MovementRules $rules) {}

    public function handle(RecurringTemplate $template, bool $checkAccount = true, bool $checkCategory = true): void
    {
        if ($checkAccount) {
            $this->rules->writableAccount($template->account_id);
        }

        if ($checkCategory) {
            $this->rules->usableCategory($template->category_id, $template->type->categoryKind());
        }

        if ($template->ends_on !== null && $template->ends_on->toDateString() < $template->starts_on->toDateString()) {
            throw ValidationException::withMessages(['ends_on' => 'La fecha de fin no puede ser anterior a la de inicio.']);
        }
    }
}

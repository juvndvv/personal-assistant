<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

final class StoreRecurringTemplateRequest extends FormRequest
{
    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return RecurringTemplateInput::rules(partial: false);
    }

    /**
     * @return array<string, mixed>
     */
    public function templateAttributes(): array
    {
        return RecurringTemplateInput::attributes($this->validated());
    }

    protected function prepareForValidation(): void
    {
        $this->merge(RecurringTemplateInput::trimmedName($this->all()));
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Recurring\RecurrenceSchedule;
use App\Enums\RecurringFrequency;
use App\Enums\RecurringType;
use Illuminate\Validation\Rule;

final class RecurringTemplateInput
{
    private const array TEXT_FIELDS = ['description', 'merchant', 'note'];

    /**
     * @return array<string, list<mixed>>
     */
    public static function rules(bool $partial): array
    {
        $required = $partial ? ['sometimes', 'required'] : ['required'];

        return [
            'name' => [...$required, 'string', 'min:1', 'max:80', MovementInputRules::validUtf8()],
            'type' => [...$required, Rule::enum(RecurringType::class)],
            'amount_cents' => [...$required, ...array_slice(MovementInputRules::magnitudeCents(required: true), 1)],
            'is_variable' => ['sometimes', 'boolean'],
            'account_id' => [...$required, 'integer'],
            'category_id' => [...$required, 'integer'],
            'frequency' => [...$required, Rule::enum(RecurringFrequency::class)],
            'day_of_month' => [...$required, 'integer', 'between:'.RecurrenceSchedule::MIN_DAY.','.RecurrenceSchedule::MAX_DAY],
            'starts_on' => [
                ...($partial ? ['sometimes', 'required', 'date_format:Y-m-d'] : MovementInputRules::date()),
                'after_or_equal:'.RecurrenceSchedule::EARLIEST_START,
            ],
            'ends_on' => MovementInputRules::date(),
            ...MovementInputRules::texts(),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public static function attributes(array $validated): array
    {
        $attributes = $validated;

        foreach (self::TEXT_FIELDS as $field) {
            if (array_key_exists($field, $attributes)) {
                $attributes[$field] = MovementInputRules::text($attributes[$field]);
            }
        }

        if (array_key_exists('is_variable', $attributes)) {
            $attributes['is_variable'] = filter_var($attributes['is_variable'], FILTER_VALIDATE_BOOLEAN);
        }

        if (array_key_exists('starts_on', $attributes) && $attributes['starts_on'] === null) {
            unset($attributes['starts_on']);
        }

        return $attributes;
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public static function trimmedName(array $input): array
    {
        return isset($input['name']) && is_string($input['name']) ? ['name' => trim($input['name'])] : [];
    }
}

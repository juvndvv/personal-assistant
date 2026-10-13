<?php

declare(strict_types=1);

namespace App\Rules;

use App\Domain\Period\PeriodResolver;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class PeriodLabel implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! PeriodResolver::isValidLabel($value)) {
            $fail(sprintf(
                'The :attribute must be a YYYY-MM period with a year between %d and %d.',
                PeriodResolver::MIN_LABEL_YEAR,
                PeriodResolver::MAX_LABEL_YEAR,
            ));
        }
    }
}

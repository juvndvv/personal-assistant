<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Ledger\MovementRules;
use App\Domain\Period\PeriodResolver;
use App\Domain\Transactions\TagMatch;
use App\Domain\Transactions\TransactionFilters;
use App\Domain\Transactions\TransactionSort;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Rules\PeriodLabel;
use BackedEnum;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ListTransactionsRequest extends FormRequest
{
    public const int DEFAULT_PER_PAGE = 50;

    public const int MAX_PER_PAGE = 100;

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $cents = ['sometimes', 'integer', 'between:0,'.MovementRules::MAX_MAGNITUDE_CENTS];

        return [
            'q' => ['sometimes', 'nullable', 'string', 'max:100', MovementInputRules::validUtf8()],
            'type' => ['sometimes', 'array'],
            'type.*' => [Rule::enum(TransactionType::class)],
            'account_id' => ['sometimes', 'array'],
            'account_id.*' => ['integer'],
            'category_id' => ['sometimes', 'array'],
            'category_id.*' => ['integer'],
            'tag_id' => ['sometimes', 'array'],
            'tag_id.*' => ['integer'],
            'tag_mode' => ['sometimes', Rule::enum(TagMatch::class)],
            'origin' => ['sometimes', 'array'],
            'origin.*' => [Rule::enum(TransactionOrigin::class)],
            'period' => ['sometimes', 'string', new PeriodLabel],
            'date_from' => ['sometimes', 'date_format:Y-m-d'],
            'date_to' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'amount_min_cents' => $cents,
            'amount_max_cents' => [...$cents, Rule::when($this->filled('amount_min_cents'), ['gte:amount_min_cents'])],
            'has_attachments' => ['sometimes', 'boolean'],
            'sort' => ['sometimes', Rule::enum(TransactionSort::class)],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'between:1,'.self::MAX_PER_PAGE],
        ];
    }

    public function filters(PeriodResolver $periods): TransactionFilters
    {
        $period = $this->filled('period') ? $periods->fromLabel($this->string('period')->toString()) : null;

        return new TransactionFilters(
            search: MovementInputRules::text($this->query('q')),
            types: $this->enumList('type', TransactionType::class),
            accountIds: $this->integers('account_id'),
            categoryIds: $this->integers('category_id'),
            tagIds: $this->integers('tag_id'),
            tagMatch: TagMatch::tryFrom($this->string('tag_mode')->toString()) ?? TagMatch::Any,
            origins: $this->enumList('origin', TransactionOrigin::class),
            dateFrom: $period->start ?? MovementInputRules::parseDate($this->query('date_from')),
            dateTo: $period->end ?? MovementInputRules::parseDate($this->query('date_to')),
            amountMinCents: $this->filled('amount_min_cents') ? $this->integer('amount_min_cents') : null,
            amountMaxCents: $this->filled('amount_max_cents') ? $this->integer('amount_max_cents') : null,
            hasAttachments: $this->filled('has_attachments') ? $this->boolean('has_attachments') : null,
            sort: TransactionSort::tryFrom($this->string('sort')->toString()) ?? TransactionSort::DateDesc,
        );
    }

    public function perPage(): int
    {
        return $this->filled('per_page') ? $this->integer('per_page') : self::DEFAULT_PER_PAGE;
    }

    /**
     * @return list<int>
     */
    private function integers(string $key): array
    {
        $values = $this->query($key);

        if (! is_array($values)) {
            return [];
        }

        return array_values(array_unique(array_map(
            fn (mixed $value): int => is_numeric($value) ? (int) $value : 0,
            $values,
        )));
    }

    /**
     * @template TEnum of BackedEnum
     *
     * @param  class-string<TEnum>  $enum
     * @return list<TEnum>
     */
    private function enumList(string $key, string $enum): array
    {
        $values = $this->query($key);

        if (! is_array($values)) {
            return [];
        }

        $cases = [];

        foreach ($values as $value) {
            $case = is_string($value) ? $enum::tryFrom($value) : null;

            if ($case !== null) {
                $cases[$case->value] = $case;
            }
        }

        return array_values($cases);
    }
}

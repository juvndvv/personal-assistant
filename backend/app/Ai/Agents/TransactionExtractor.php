<?php

declare(strict_types=1);

namespace App\Ai\Agents;

use App\Ai\ExtractionCatalog;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Promptable;

final class TransactionExtractor implements Agent, HasStructuredOutput
{
    use Promptable;

    public const array FIELDS = [
        'type', 'amount_cents', 'date', 'description', 'merchant', 'category_id', 'account_id', 'to_account_id',
    ];

    private const array WEEKDAYS = [
        1 => 'lunes', 2 => 'martes', 3 => 'miércoles', 4 => 'jueves', 5 => 'viernes', 6 => 'sábado', 7 => 'domingo',
    ];

    public function __construct(
        private readonly CarbonImmutable $today,
        private readonly ExtractionCatalog $catalog,
    ) {}

    public function instructions(): string
    {
        return view('ai.transaction-extractor', [
            'today' => $this->today->toDateString(),
            'weekday' => self::WEEKDAYS[$this->today->dayOfWeekIso],
            'accounts' => json_encode($this->catalog->accounts, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            'categories' => json_encode($this->catalog->categories, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ])->render();
    }

    public function schema(JsonSchema $schema): array
    {
        $confidence = [];

        foreach (self::FIELDS as $field) {
            $confidence[$field] = $schema->number()->min(0)->max(1)->required();
        }

        return [
            'type' => $schema->string()->enum(['expense', 'income', 'transfer', null])->nullable()->required(),
            'amount_cents' => $schema->integer()->nullable()->required(),
            'date' => $schema->string()->nullable()->required(),
            'description' => $schema->string()->nullable()->required(),
            'merchant' => $schema->string()->nullable()->required(),
            'category_id' => $schema->integer()->nullable()->required(),
            'account_id' => $schema->integer()->nullable()->required(),
            'to_account_id' => $schema->integer()->nullable()->required(),
            'confidence' => $schema->object($confidence)->withoutAdditionalProperties()->required(),
        ];
    }
}

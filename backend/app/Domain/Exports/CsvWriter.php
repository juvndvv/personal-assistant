<?php

declare(strict_types=1);

namespace App\Domain\Exports;

use App\Enums\CsvDelimiter;
use Carbon\CarbonImmutable;
use InvalidArgumentException;

final class CsvWriter
{
    public const string BYTE_ORDER_MARK = "\xEF\xBB\xBF";

    public const string LINE_END = "\r\n";

    private const string FORMULA_TRIGGERS = "=+-@\t\r";

    private const string PLAIN_NUMBER = '/^-?\d+(?:[.,]\d+)?$/';

    /**
     * @param  resource  $stream
     */
    private function __construct(
        private $stream,
        public readonly CsvDelimiter $delimiter,
    ) {}

    /**
     * @param  resource  $stream
     * @param  list<string>  $header
     */
    public static function start($stream, CsvDelimiter $delimiter, array $header): self
    {
        if (! is_resource($stream)) {
            throw new InvalidArgumentException('The CSV output must be an open stream.');
        }

        $writer = new self($stream, $delimiter);
        fwrite($stream, self::BYTE_ORDER_MARK);
        $writer->row($header);

        return $writer;
    }

    /**
     * @param  list<int|string|bool|CarbonImmutable|null>  $cells
     */
    public function row(array $cells): void
    {
        fwrite($this->stream, implode(
            $this->delimiter->character(),
            array_map($this->cell(...), $cells),
        ).self::LINE_END);
    }

    public function euros(?int $cents): ?string
    {
        if ($cents === null) {
            return null;
        }

        $magnitude = abs($cents);

        return sprintf(
            '%s%d%s%02d',
            $cents < 0 ? '-' : '',
            intdiv($magnitude, 100),
            $this->delimiter->decimalSeparator(),
            $magnitude % 100,
        );
    }

    public static function guard(string $value): string
    {
        if ($value === '' || preg_match(self::PLAIN_NUMBER, $value) === 1) {
            return $value;
        }

        return str_contains(self::FORMULA_TRIGGERS, $value[0]) ? "'".$value : $value;
    }

    private function cell(int|string|bool|CarbonImmutable|null $value): string
    {
        $text = match (true) {
            $value === null => '',
            is_bool($value) => $value ? '1' : '0',
            is_int($value) => (string) $value,
            $value instanceof CarbonImmutable => $value->toIso8601String(),
            default => self::guard($value),
        };

        if (strpbrk($text, $this->delimiter->character()."\"\r\n") === false) {
            return $text;
        }

        return '"'.str_replace('"', '""', $text).'"';
    }
}

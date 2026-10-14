<?php

declare(strict_types=1);

namespace Tests\Support;

use PHPUnit\Framework\Assert;

final class Csv
{
    public const string BOM = "\xEF\xBB\xBF";

    /**
     * @return list<string>
     */
    public static function header(string $content, string $delimiter = ';'): array
    {
        return self::table($content, $delimiter)[0];
    }

    /**
     * @return list<array<string, string>>
     */
    public static function rows(string $content, string $delimiter = ';'): array
    {
        $table = self::table($content, $delimiter);
        $header = array_shift($table);

        return array_map(fn (array $cells): array => array_combine($header, $cells), $table);
    }

    /**
     * @return non-empty-list<list<string>>
     */
    public static function table(string $content, string $delimiter = ';'): array
    {
        Assert::assertStringStartsWith(self::BOM, $content, 'The CSV must start with a UTF-8 BOM.');
        Assert::assertStringEndsWith("\r\n", $content, 'The CSV must end with CRLF.');

        $stream = fopen('php://memory', 'w+b');
        fwrite($stream, substr($content, strlen(self::BOM)));
        rewind($stream);

        $table = [];

        while (($cells = fgetcsv($stream, separator: $delimiter, enclosure: '"', escape: '')) !== false) {
            $table[] = array_map(fn (?string $cell): string => (string) $cell, $cells);
        }

        fclose($stream);
        Assert::assertNotEmpty($table);

        return $table;
    }

    public static function centsFromEuros(string $euros, string $decimalSeparator): int
    {
        Assert::assertMatchesRegularExpression('/^-?\d+'.preg_quote($decimalSeparator, '/').'\d{2}$/', $euros);
        [$units, $decimals] = explode($decimalSeparator, ltrim($euros, '-'));
        $cents = ((int) $units) * 100 + (int) $decimals;

        return str_starts_with($euros, '-') ? -$cents : $cents;
    }
}

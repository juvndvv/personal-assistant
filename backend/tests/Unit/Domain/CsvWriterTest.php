<?php

declare(strict_types=1);

use App\Domain\Exports\CsvWriter;
use App\Enums\CsvDelimiter;
use Carbon\CarbonImmutable;

/**
 * @param  list<list<int|string|bool|CarbonImmutable|null>>  $rows
 */
function csvOutput(CsvDelimiter $delimiter, array $header, array $rows = []): string
{
    $stream = fopen('php://memory', 'w+b');
    $writer = CsvWriter::start($stream, $delimiter, $header);

    foreach ($rows as $row) {
        $writer->row($row);
    }

    rewind($stream);
    $content = (string) stream_get_contents($stream);
    fclose($stream);

    return $content;
}

it('writes a UTF-8 BOM, the delimiter and CRLF line endings', function (): void {
    expect(csvOutput(CsvDelimiter::Semicolon, ['id', 'name'], [[1, 'Café']]))
        ->toBe("\xEF\xBB\xBFid;name\r\n1;Café\r\n")
        ->and(csvOutput(CsvDelimiter::Comma, ['id', 'name'], [[1, 'Café']]))
        ->toBe("\xEF\xBB\xBFid,name\r\n1,Café\r\n");
});

it('quotes cells following RFC 4180', function (): void {
    $content = csvOutput(CsvDelimiter::Semicolon, ['a', 'b', 'c', 'd'], [['uno; dos', 'dice "hola"', "línea\r\nnueva", 'a,b']]);

    expect($content)->toEndWith("\"uno; dos\";\"dice \"\"hola\"\"\";\"línea\r\nnueva\";a,b\r\n")
        ->and(csvOutput(CsvDelimiter::Comma, ['a'], [['a,b']]))->toEndWith("\"a,b\"\r\n");
});

it('neutralizes cells that spreadsheets would run as formulas', function (string $cell, string $written): void {
    expect(CsvWriter::guard($cell))->toBe($written);
})->with([
    ['=HYPERLINK("http://x")', '\'=HYPERLINK("http://x")'],
    ['+34 600', "'+34 600"],
    ['-cmd', "'-cmd"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ["\tTAB", "'\tTAB"],
    ["\rCR", "'\rCR"],
    ['-23,50', '-23,50'],
    ['-2350', '-2350'],
    ['Mercadona', 'Mercadona'],
    ['', ''],
]);

it('formats signed euros with the decimal separator of the delimiter', function (?int $cents, CsvDelimiter $delimiter, ?string $euros): void {
    $writer = CsvWriter::start(fopen('php://memory', 'w+b'), $delimiter, ['x']);

    expect($writer->euros($cents))->toBe($euros);
})->with([
    [-2350, CsvDelimiter::Semicolon, '-23,50'],
    [5, CsvDelimiter::Semicolon, '0,05'],
    [-5, CsvDelimiter::Comma, '-0.05'],
    [9_999_999_999, CsvDelimiter::Comma, '99999999.99'],
    [0, CsvDelimiter::Semicolon, '0,00'],
    [null, CsvDelimiter::Semicolon, null],
]);

it('writes nulls as empty cells, booleans as 1/0 and timestamps as ISO 8601', function (): void {
    expect(csvOutput(CsvDelimiter::Semicolon, ['a', 'b', 'c', 'd'], [[null, true, false, CarbonImmutable::parse('2026-10-13 08:15', 'Europe/Madrid')]]))
        ->toEndWith(";1;0;2026-10-13T08:15:00+02:00\r\n");
});

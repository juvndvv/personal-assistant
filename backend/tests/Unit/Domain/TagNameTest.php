<?php

declare(strict_types=1);

use App\Domain\Tags\TagName;

it('normalizes tag names', function (string $raw, string $expected): void {
    expect(TagName::normalize($raw))->toBe($expected);
})->with([
    ['  Viaje   Roma ', 'viaje roma'],
    ['ÁRBOL', 'árbol'],
    ["casa\tnueva", 'casa nueva'],
    ['   ', ''],
]);

it('normalizes a list, dropping blanks, duplicates and non-strings', function (): void {
    expect(TagName::normalizeAll(['Casa', ' casa ', '', 'VIAJE', 5, null]))->toBe(['casa', 'viaje']);
});

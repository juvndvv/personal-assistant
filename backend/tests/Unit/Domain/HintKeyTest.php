<?php

declare(strict_types=1);

use App\Domain\Text\HintKey;

it('normalizes merchants and concepts into hint keys', function (?string $text, ?string $key): void {
    expect(HintKey::normalize($text))->toBe($key);
})->with([
    'legal suffix with dots' => ['MERCADONA S.A.', 'mercadona'],
    'accents, punctuation and digits' => ['Café Pepe, 12', 'cafe pepe'],
    'legal suffix without dots' => ['Mercadona SA', 'mercadona'],
    'limited company' => ['Panadería López S.L.', 'panaderia lopez'],
    'limited company without dots' => ['Ferretería Ruiz, SL', 'ferreteria ruiz'],
    'spaced legal suffix' => ['Talleres Gómez S. L.', 'talleres gomez'],
    'sole-member limited company' => ['Construcciones Pepe S.L.U.', 'construcciones pepe'],
    'sole-member public company' => ['Zara España S.A.U.', 'zara espana'],
    'sole-member limited company without dots' => ['ACME SLU', 'acme'],
    'sole-member public company without dots' => ['Inditex, SAU', 'inditex'],
    'spaced sole-member suffix' => ['Talleres Gómez S. L. U.', 'talleres gomez'],
    'legal suffix followed by a word starting with u' => ['Hermanos S.L. Unión', 'hermanos sl union'],
    'collapsed spaces' => ["  Bar   la\tEsquina  ", 'bar la esquina'],
    'eñe' => ['Ñoquis Peña', 'noquis pena'],
    'leading article that looks like a suffix' => ['Sa Pobla Market', 'sa pobla market'],
    'only a suffix' => ['S.A.', 'sa'],
    'only digits' => ['12345', null],
    'only punctuation' => ['--- !!', null],
    'empty' => ['', null],
    'null' => [null, null],
]);

it('prefers the merchant and falls back to the description', function (): void {
    expect(HintKey::forMovement('MERCADONA S.A.', 'Compra semanal'))->toBe('mercadona')
        ->and(HintKey::forMovement(null, 'Gasolina Repsol 45 L'))->toBe('gasolina repsol l')
        ->and(HintKey::forMovement('123', 'Peluquería'))->toBe('peluqueria')
        ->and(HintKey::forMovement(null, null))->toBeNull();
});

it('caps keys at the column length', function (): void {
    $key = HintKey::normalize(str_repeat('abcde ', 60));

    expect($key)->not->toBeNull()
        ->and(mb_strlen((string) $key))->toBeLessThanOrEqual(HintKey::MAX_LENGTH)
        ->and($key)->not->toEndWith(' ');
});

it('rejects invalid UTF-8', function (): void {
    expect(HintKey::normalize("Caf\xC3"))->toBeNull();
});

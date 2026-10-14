<?php

declare(strict_types=1);

namespace App\Enums;

enum CsvDelimiter: string
{
    case Semicolon = 'semicolon';
    case Comma = 'comma';

    public function character(): string
    {
        return match ($this) {
            self::Semicolon => ';',
            self::Comma => ',',
        };
    }

    public function decimalSeparator(): string
    {
        return match ($this) {
            self::Semicolon => ',',
            self::Comma => '.',
        };
    }
}

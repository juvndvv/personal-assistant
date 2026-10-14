<?php

declare(strict_types=1);

namespace App\Domain\Text;

use Normalizer;

final class HintKey
{
    public const int MAX_LENGTH = 160;

    private const array LEGAL_SUFFIXES = ['sa', 'sau', 'sl', 'slu'];

    public static function forMovement(?string $merchant, ?string $description): ?string
    {
        return self::normalize($merchant) ?? self::normalize($description);
    }

    public static function normalize(?string $text): ?string
    {
        if ($text === null || ! mb_check_encoding($text, 'UTF-8')) {
            return null;
        }

        $key = self::unaccent(mb_strtolower($text, 'UTF-8'));
        $key = (string) preg_replace('/(?<![\p{L}\p{N}])s\.\s?([al])\.?\s?(u)?\.?(?![\p{L}\p{N}])/u', ' s$1$2 ', $key);
        $key = (string) preg_replace('/[^\p{L}\s]+/u', ' ', $key);
        $words = preg_split('/\s+/u', trim($key), flags: PREG_SPLIT_NO_EMPTY) ?: [];

        while (count($words) > 1 && in_array($words[array_key_last($words)], self::LEGAL_SUFFIXES, true)) {
            array_pop($words);
        }

        $key = rtrim(mb_substr(implode(' ', $words), 0, self::MAX_LENGTH));

        return $key === '' ? null : $key;
    }

    private static function unaccent(string $text): string
    {
        $decomposed = Normalizer::normalize($text, Normalizer::FORM_D);

        return (string) preg_replace('/\p{Mn}+/u', '', $decomposed === false ? $text : $decomposed);
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Tags;

final class TagName
{
    public const int MAX_LENGTH = 40;

    public static function normalize(string $name): string
    {
        if (! mb_check_encoding($name, 'UTF-8')) {
            return $name;
        }

        $collapsed = preg_replace('/\s+/u', ' ', trim($name)) ?? trim($name);

        return mb_strtolower($collapsed);
    }

    /**
     * @param  iterable<mixed>  $names
     * @return list<string>
     */
    public static function normalizeAll(iterable $names): array
    {
        $normalized = [];

        foreach ($names as $name) {
            if (! is_string($name)) {
                continue;
            }

            $tag = self::normalize($name);

            if ($tag !== '') {
                $normalized[$tag] = $tag;
            }
        }

        return array_values($normalized);
    }
}

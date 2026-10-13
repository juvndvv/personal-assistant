<?php

declare(strict_types=1);

namespace App\Ai;

use RuntimeException;

final class UnusableCaptureOutput extends RuntimeException
{
    public static function noSpeech(): self
    {
        return new self('No se reconoció ninguna voz en la grabación.');
    }

    public static function unstructured(): self
    {
        return new self('La IA no devolvió un movimiento reconocible.');
    }
}

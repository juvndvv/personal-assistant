<?php

declare(strict_types=1);

namespace App\Ai;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Throwable;

final class CaptureFailureMessage
{
    public const string TIMED_OUT = 'El proveedor de IA no respondió a tiempo.';

    public const string GENERIC = 'No se pudo procesar la captura con IA.';

    public static function for(Throwable $exception): string
    {
        if ($exception instanceof UnusableCaptureOutput) {
            return $exception->getMessage();
        }

        for ($current = $exception; $current !== null; $current = $current->getPrevious()) {
            if ($current instanceof CaptureDeadlineExceeded
                || $current instanceof ProviderConnectionException
                || $current instanceof ConnectionException) {
                return self::TIMED_OUT;
            }

            if ($current instanceof RequestException) {
                return 'El proveedor de IA devolvió un error (HTTP '.$current->response->status().').';
            }
        }

        return self::GENERIC;
    }
}

<?php

declare(strict_types=1);

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use RuntimeException;

final class DomainConflict extends RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return new JsonResponse(
            ['message' => $this->getMessage(), 'code' => $this->errorCode],
            Response::HTTP_CONFLICT,
        );
    }
}

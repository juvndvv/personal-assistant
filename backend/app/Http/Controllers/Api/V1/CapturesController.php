<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Captures\CreateCapture;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreCaptureRequest;
use App\Http\Resources\Api\V1\CaptureResource;
use App\Http\Resources\Api\V1\DraftResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use LogicException;

final class CapturesController extends Controller
{
    public function store(StoreCaptureRequest $request, CreateCapture $createCapture): JsonResponse
    {
        $draft = $createCapture->handle(
            kind: $request->kind(),
            file: $request->upload(),
            mime: $request->mime(),
            clientStartedAt: $request->clientStartedAt(),
        );

        $capture = $draft->capture ?? throw new LogicException('A capture draft always has its capture.');

        return new JsonResponse(
            ['data' => [
                'capture' => (new CaptureResource($capture))->resolve($request),
                'draft' => (new DraftResource($draft))->resolve($request),
            ]],
            Response::HTTP_CREATED,
        );
    }
}

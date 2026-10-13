<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Transfers\DeleteTransfer;
use App\Actions\Transfers\RegisterTransfer;
use App\Actions\Transfers\RestoreTransfer;
use App\Actions\Transfers\UpdateTransfer;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreTransferRequest;
use App\Http\Requests\Api\V1\UpdateTransferRequest;
use App\Http\Resources\Api\V1\TransferResource;
use App\Models\Transfer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

final class TransfersController extends Controller
{
    public function store(StoreTransferRequest $request, RegisterTransfer $registerTransfer): JsonResponse
    {
        $transfer = $registerTransfer->handle(
            fromAccountId: $request->fromAccountId(),
            toAccountId: $request->toAccountId(),
            amountCents: $request->amountCents(),
            date: $request->movementDate(),
            kind: $request->kind(),
            note: $request->note(),
            draftId: $request->draftId(),
        );

        return $this->resource($transfer)->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Transfer $transfer): TransferResource
    {
        return $this->resource($transfer);
    }

    public function update(UpdateTransferRequest $request, Transfer $transfer, UpdateTransfer $updateTransfer): TransferResource
    {
        return $this->resource($updateTransfer->handle($transfer, $request->changes()));
    }

    public function destroy(Transfer $transfer, DeleteTransfer $deleteTransfer): Response
    {
        $deleteTransfer->handle($transfer);

        return response()->noContent();
    }

    public function restore(Transfer $transfer, RestoreTransfer $restoreTransfer): TransferResource
    {
        return $this->resource($restoreTransfer->handle($transfer)->unsetRelation('legs'));
    }

    private function resource(Transfer $transfer): TransferResource
    {
        return new TransferResource($transfer->loadMissing(TransferResource::RELATIONS));
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Transactions\DeleteTransaction;
use App\Actions\Transactions\RegisterTransaction;
use App\Actions\Transactions\RestoreTransaction;
use App\Actions\Transactions\UpdateTransaction;
use App\Domain\Period\PeriodResolver;
use App\Domain\Transactions\TransactionQuery;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListTransactionsRequest;
use App\Http\Requests\Api\V1\StoreTransactionRequest;
use App\Http\Requests\Api\V1\UpdateTransactionRequest;
use App\Http\Resources\Api\V1\TransactionResource;
use App\Models\Transaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class TransactionsController extends Controller
{
    public function index(ListTransactionsRequest $request, TransactionQuery $transactions, PeriodResolver $periods): AnonymousResourceCollection
    {
        $filters = $request->filters($periods);

        $page = $transactions->sorted($filters)
            ->with(TransactionResource::RELATIONS)
            ->withReceiptsCount()
            ->paginate($request->perPage())
            ->withQueryString();

        return TransactionResource::collection($page)
            ->additional(['meta' => ['totals' => $transactions->totals($filters)]]);
    }

    public function store(StoreTransactionRequest $request, RegisterTransaction $registerTransaction): JsonResponse
    {
        $transaction = $registerTransaction->handle(
            type: $request->type(),
            amountCents: $request->amountCents(),
            categoryId: $request->categoryId(),
            date: $request->movementDate(),
            accountId: $request->accountId(),
            description: $request->text('description'),
            merchant: $request->text('merchant'),
            note: $request->text('note'),
            tags: $request->tags(),
            draftId: $request->draftId(),
        );

        return $this->resource($transaction)->response()->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Transaction $transaction): TransactionResource
    {
        return $this->resource($transaction);
    }

    public function update(UpdateTransactionRequest $request, Transaction $transaction, UpdateTransaction $updateTransaction): TransactionResource
    {
        return $this->resource($updateTransaction->handle($transaction, $request->changes()));
    }

    public function destroy(Transaction $transaction, DeleteTransaction $deleteTransaction): Response
    {
        $deleteTransaction->handle($transaction);

        return response()->noContent();
    }

    public function restore(Transaction $transaction, RestoreTransaction $restoreTransaction): TransactionResource
    {
        return $this->resource($restoreTransaction->handle($transaction));
    }

    private function resource(Transaction $transaction): TransactionResource
    {
        return new TransactionResource($transaction->loadMissing(TransactionResource::RELATIONS)->loadReceiptsCount());
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Accounts\ArchiveAccount;
use App\Actions\Accounts\CreateAccount;
use App\Actions\Accounts\DeleteAccount;
use App\Actions\Accounts\UnarchiveAccount;
use App\Actions\Accounts\UpdateAccount;
use App\Actions\Ledger\RecordBalanceAdjustment;
use App\Domain\Ledger\BalanceCalculator;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\AccountBalanceRequest;
use App\Http\Requests\Api\V1\IndexAccountsRequest;
use App\Http\Requests\Api\V1\StoreAccountRequest;
use App\Http\Requests\Api\V1\StoreBalanceAdjustmentRequest;
use App\Http\Requests\Api\V1\UpdateAccountRequest;
use App\Http\Resources\Api\V1\AccountResource;
use App\Http\Resources\Api\V1\TransactionResource;
use App\Models\Account;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class AccountsController extends Controller
{
    public function __construct(private readonly BalanceCalculator $balances) {}

    public function index(IndexAccountsRequest $request): AnonymousResourceCollection
    {
        $accounts = Account::query()
            ->when(! $request->includeArchived(), fn ($query) => $query->active())
            ->ordered()
            ->get();

        return AccountResource::collectionWithLedgers(
            $accounts,
            $this->balances->summaries(accountIds: $accounts->map(fn (Account $account): int => $account->id)->all()),
        );
    }

    public function store(StoreAccountRequest $request, CreateAccount $createAccount): JsonResponse
    {
        return $this->resource($createAccount->handle($request->validated()))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Account $account): AccountResource
    {
        return $this->resource($account);
    }

    public function update(UpdateAccountRequest $request, Account $account, UpdateAccount $updateAccount): AccountResource
    {
        return $this->resource($updateAccount->handle($account, $request->validated()));
    }

    public function destroy(Account $account, DeleteAccount $deleteAccount): Response
    {
        $deleteAccount->handle($account);

        return response()->noContent();
    }

    public function archive(Account $account, ArchiveAccount $archiveAccount): AccountResource
    {
        return $this->resource($archiveAccount->handle($account));
    }

    public function unarchive(Account $account, UnarchiveAccount $unarchiveAccount): AccountResource
    {
        return $this->resource($unarchiveAccount->handle($account));
    }

    public function balance(AccountBalanceRequest $request, Account $account): JsonResponse
    {
        $date = $request->balanceDate();

        return new JsonResponse(['data' => [
            'account_id' => $account->id,
            'date' => $date->toDateString(),
            'balance_cents' => $this->balances->forAccount($account->id, $date),
        ]]);
    }

    public function storeAdjustment(StoreBalanceAdjustmentRequest $request, Account $account, RecordBalanceAdjustment $recordAdjustment): JsonResponse
    {
        $adjustment = $recordAdjustment->handle(
            $account,
            $request->adjustmentDate(),
            $request->targetBalanceCents(),
            $request->note(),
        );

        return (new TransactionResource($adjustment->load(['account', 'category.parent', 'transfer', 'tags'])))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    private function resource(Account $account): AccountResource
    {
        return new AccountResource($account, $this->balances->summary($account->id));
    }
}

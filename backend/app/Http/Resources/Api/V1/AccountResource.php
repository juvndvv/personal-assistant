<?php

declare(strict_types=1);

namespace App\Http\Resources\Api\V1;

use App\Domain\Ledger\AccountLedgerSummary;
use App\Models\Account;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * @property Account $resource
 */
final class AccountResource extends JsonResource
{
    public function __construct(Account $account, private readonly AccountLedgerSummary $ledger)
    {
        parent::__construct($account);
    }

    /**
     * @param  Collection<int, Account>  $accounts
     * @param  array<int, AccountLedgerSummary>  $ledgers
     */
    public static function collectionWithLedgers(Collection $accounts, array $ledgers): AnonymousResourceCollection
    {
        return new AnonymousResourceCollection(
            $accounts->map(fn (Account $account): self => new self(
                $account,
                $ledgers[$account->id] ?? new AccountLedgerSummary($account->id, $account->opening_balance_cents, null, null),
            )),
            self::class,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $account = $this->resource;

        return [
            'id' => $account->id,
            'name' => $account->name,
            'type' => $account->type->value,
            'opening_balance_cents' => $account->opening_balance_cents,
            'opening_date' => $account->opening_date->toDateString(),
            'statement_day' => $account->statement_day,
            'settlement_account_id' => $account->settlement_account_id,
            'sort_order' => $account->sort_order,
            'archived_at' => $account->archived_at?->toIso8601String(),
            'balance_cents' => $this->ledger->balanceCents,
            'last_movement_date' => $this->ledger->lastMovementDate?->toDateString(),
            'last_adjustment_date' => $this->ledger->lastAdjustmentDate?->toDateString(),
            'last_updated_on' => $this->ledger->lastUpdatedOn($account)->toDateString(),
            'stale' => $this->ledger->isStale($account, CarbonImmutable::today()),
            'created_at' => $account->created_at?->toIso8601String(),
        ];
    }
}

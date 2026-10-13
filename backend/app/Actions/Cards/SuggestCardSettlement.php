<?php

declare(strict_types=1);

namespace App\Actions\Cards;

use App\Domain\Cards\CardSettlementSuggestion;
use App\Domain\Cards\StatementWindow;
use App\Domain\Ledger\BalanceCalculator;
use App\Enums\AccountType;
use App\Enums\TransferKind;
use App\Exceptions\DomainConflict;
use App\Models\Account;
use App\Models\Setting;
use App\Models\Transfer;
use Carbon\CarbonImmutable;

final readonly class SuggestCardSettlement
{
    public function __construct(private BalanceCalculator $balances) {}

    public function handle(Account $card, ?CarbonImmutable $date = null): CardSettlementSuggestion
    {
        if ($card->type !== AccountType::CreditCard) {
            throw new DomainConflict('not_a_credit_card', 'La cuenta no es una tarjeta de crédito.');
        }

        $date = ($date ?? CarbonImmutable::today())->startOfDay();
        $window = $card->statement_day === null ? null : StatementWindow::lastClosedOn($card->statement_day, $date);
        $statementBalance = $this->balances->forAccount($card->id, $window->end ?? $date);
        $settledSince = $window === null ? 0 : $this->settledBetween($card, $window->end, $date);

        return new CardSettlementSuggestion(
            cardAccountId: $card->id,
            statementStart: $window?->start,
            statementEnd: $window?->end,
            statementBalanceCents: $statementBalance,
            settledSinceCents: $settledSince,
            suggestedCents: max(0, -$statementBalance - $settledSince),
            fromAccountId: $card->settlement_account_id ?? $this->defaultSettlementAccountId(),
        );
    }

    private function settledBetween(Account $card, CarbonImmutable $after, CarbonImmutable $until): int
    {
        $sum = Transfer::query()
            ->where('kind', TransferKind::CardSettlement->value)
            ->where('to_account_id', $card->id)
            ->where('date', '>', $after->toDateString())
            ->where('date', '<=', $until->toDateString())
            ->sum('amount_cents');

        return (int) $sum;
    }

    private function defaultSettlementAccountId(): ?int
    {
        $defaultAccountId = Setting::current()->default_account_id;

        if ($defaultAccountId === null) {
            return null;
        }

        $isEligible = Account::query()
            ->active()
            ->whereKey($defaultAccountId)
            ->where('type', '!=', AccountType::CreditCard->value)
            ->exists();

        return $isEligible ? $defaultAccountId : null;
    }
}

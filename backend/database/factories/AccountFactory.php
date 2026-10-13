<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\AccountType;
use App\Models\Account;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Account>
 */
final class AccountFactory extends Factory
{
    protected $model = Account::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->company(),
            'type' => AccountType::Checking,
            'opening_balance_cents' => 0,
            'opening_date' => CarbonImmutable::today()->subYear(),
            'sort_order' => 0,
        ];
    }

    public function ofType(AccountType $type): self
    {
        return $this->state(['type' => $type]);
    }

    public function creditCard(?int $statementDay = null, ?int $settlementAccountId = null): self
    {
        return $this->state([
            'type' => AccountType::CreditCard,
            'statement_day' => $statementDay,
            'settlement_account_id' => $settlementAccountId,
        ]);
    }

    public function archived(): self
    {
        return $this->state(['archived_at' => CarbonImmutable::now()]);
    }

    public function openedOn(CarbonImmutable $date, int $openingBalanceCents = 0): self
    {
        return $this->state(['opening_date' => $date, 'opening_balance_cents' => $openingBalanceCents]);
    }
}

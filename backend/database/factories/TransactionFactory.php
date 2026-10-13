<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\CategoryKind;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Transaction>
 */
final class TransactionFactory extends Factory
{
    protected $model = Transaction::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => TransactionType::Expense,
            'account_id' => Account::factory(),
            'amount_cents' => -1 * fake()->numberBetween(100, 10_000),
            'date' => CarbonImmutable::today(),
            'category_id' => Category::factory(),
            'origin' => TransactionOrigin::Manual,
        ];
    }

    public function expense(int $magnitudeCents): self
    {
        return $this->state([
            'type' => TransactionType::Expense,
            'amount_cents' => -$magnitudeCents,
            'category_id' => Category::factory(),
        ]);
    }

    public function income(int $magnitudeCents): self
    {
        return $this->state([
            'type' => TransactionType::Income,
            'amount_cents' => $magnitudeCents,
            'category_id' => Category::factory()->state(['kind' => CategoryKind::Income]),
        ]);
    }

    public function adjustment(int $deltaCents, int $targetCents): self
    {
        return $this->state([
            'type' => TransactionType::Adjustment,
            'amount_cents' => $deltaCents,
            'adjustment_target_cents' => $targetCents,
            'category_id' => null,
        ]);
    }

    public function on(Account $account, ?CarbonImmutable $date = null): self
    {
        return $this->state(array_filter([
            'account_id' => $account->id,
            'date' => $date,
        ], fn (mixed $value): bool => $value !== null));
    }
}

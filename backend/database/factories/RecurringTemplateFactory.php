<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\RecurringFrequency;
use App\Enums\RecurringType;
use App\Models\Account;
use App\Models\Category;
use App\Models\RecurringTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RecurringTemplate>
 */
final class RecurringTemplateFactory extends Factory
{
    protected $model = RecurringTemplate::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(2, true),
            'type' => RecurringType::Expense,
            'amount_cents' => fake()->numberBetween(1_000, 100_000),
            'is_variable' => false,
            'account_id' => Account::factory(),
            'category_id' => Category::factory(),
            'frequency' => RecurringFrequency::Monthly,
            'day_of_month' => 5,
            'starts_on' => CarbonImmutable::today()->startOfMonth(),
        ];
    }

    public function income(?Category $category = null): self
    {
        return $this->state([
            'type' => RecurringType::Income,
            'category_id' => $category === null ? Category::factory()->income() : $category->id,
        ]);
    }

    public function variable(): self
    {
        return $this->state(['is_variable' => true]);
    }

    public function paused(CarbonImmutable $at): self
    {
        return $this->state(['paused_at' => $at]);
    }
}

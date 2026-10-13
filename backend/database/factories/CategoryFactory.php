<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\CategoryKind;
use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
final class CategoryFactory extends Factory
{
    protected $model = Category::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'kind' => CategoryKind::Expense,
            'name' => fake()->unique()->words(2, true),
            'sort_order' => 0,
        ];
    }

    public function income(): self
    {
        return $this->state(['kind' => CategoryKind::Income]);
    }

    public function childOf(Category $parent): self
    {
        return $this->state(['parent_id' => $parent->id, 'kind' => $parent->kind]);
    }

    public function archived(): self
    {
        return $this->state(['archived_at' => now()]);
    }
}

<?php

declare(strict_types=1);

use App\Actions\Budgets\SetBudget;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
use Tests\Support\Reports;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-14 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
});

function budgetFor(Category $category, string $period): array
{
    $budgets = test()->getJson("/api/v1/budgets?period={$period}")->assertOk()->json('data');

    return collect($budgets)->firstWhere('category.id', $category->id);
}

it('repeats a budget every period until it is changed', function (): void {
    $food = Category::factory()->create(['name' => 'Alimentación']);

    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-07'])
        ->assertOk()
        ->assertExactJson(['data' => [
            'category' => ['id' => $food->id, 'name' => 'Alimentación', 'kind' => 'expense', 'parent_id' => null, 'parent_name' => null],
            'amount_cents' => 40_000,
            'effective_from' => '2026-07',
        ]]);

    expect(budgetFor($food, '2026-06'))->toMatchArray(['amount_cents' => null, 'effective_from' => null])
        ->and(budgetFor($food, '2026-07'))->toMatchArray(['amount_cents' => 40_000, 'effective_from' => '2026-07'])
        ->and(budgetFor($food, '2026-08'))->toMatchArray(['amount_cents' => 40_000, 'effective_from' => '2026-07'])
        ->and(budgetFor($food, '2026-09'))->toMatchArray(['amount_cents' => 40_000, 'effective_from' => '2026-07']);
});

it('applies a change only from its period onward', function (): void {
    $food = Category::factory()->create();

    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-07'])->assertOk();
    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 45_000, 'effective_from' => '2026-09'])->assertOk();
    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 0, 'effective_from' => '2026-11'])
        ->assertOk()
        ->assertJsonPath('data.amount_cents', null)
        ->assertJsonPath('data.effective_from', null);

    expect(budgetFor($food, '2026-08')['amount_cents'])->toBe(40_000)
        ->and(budgetFor($food, '2026-09')['amount_cents'])->toBe(45_000)
        ->and(budgetFor($food, '2026-10'))->toMatchArray(['amount_cents' => 45_000, 'effective_from' => '2026-09'])
        ->and(budgetFor($food, '2026-11'))->toMatchArray(['amount_cents' => null, 'effective_from' => null])
        ->and(budgetFor($food, '2027-03')['amount_cents'])->toBeNull();
});

it('upserts the row of the same period', function (): void {
    $food = Category::factory()->create();

    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-07'])->assertOk();
    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 42_000, 'effective_from' => '2026-07'])->assertOk();

    $this->getJson("/api/v1/budgets/{$food->id}/history")
        ->assertOk()
        ->assertExactJson(['data' => [['effective_from' => '2026-07', 'amount_cents' => 42_000]]]);
});

it('defaults the effective period to the current one', function (int $startDay, string $label): void {
    Reports::useMonthStartDay($startDay);
    $food = Category::factory()->create();

    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 30_000])
        ->assertOk()
        ->assertJsonPath('data.effective_from', $label);
})->with([
    'calendar month' => [1, '2026-10'],
    'payday on the 10th' => [10, '2026-10'],
    'payday on the 25th' => [25, '2026-10'],
    'payday on the 14th' => [14, '2026-10'],
    'payday on the 15th' => [15, '2026-09'],
]);

it('lists every non-archived top-level expense category in order', function (): void {
    $housing = Category::factory()->create(['name' => 'Vivienda', 'sort_order' => 0]);
    $food = Category::factory()->create(['name' => 'Alimentación', 'sort_order' => 1]);
    Category::factory()->childOf($food)->create();
    Category::factory()->archived()->create();
    Category::factory()->income()->create();

    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-07'])->assertOk();

    $this->getJson('/api/v1/budgets?period=2026-10')
        ->assertOk()
        ->assertExactJson(['data' => [
            [
                'category' => ['id' => $housing->id, 'name' => 'Vivienda', 'kind' => 'expense', 'parent_id' => null, 'parent_name' => null],
                'amount_cents' => null,
                'effective_from' => null,
            ],
            [
                'category' => ['id' => $food->id, 'name' => 'Alimentación', 'kind' => 'expense', 'parent_id' => null, 'parent_name' => null],
                'amount_cents' => 40_000,
                'effective_from' => '2026-07',
            ],
        ]]);
});

it('uses the current period when listing without a period', function (): void {
    $food = Category::factory()->create();
    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-11'])->assertOk();

    $this->getJson('/api/v1/budgets')->assertOk()->assertJsonPath('data.0.amount_cents', null);
});

it('returns the history newest first including stops', function (): void {
    $food = Category::factory()->create();

    foreach ([['2026-09', 45_000], ['2026-07', 40_000], ['2026-11', 0]] as [$label, $amount]) {
        $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => $amount, 'effective_from' => $label])->assertOk();
    }

    $this->getJson("/api/v1/budgets/{$food->id}/history")
        ->assertOk()
        ->assertExactJson(['data' => [
            ['effective_from' => '2026-11', 'amount_cents' => 0],
            ['effective_from' => '2026-09', 'amount_cents' => 45_000],
            ['effective_from' => '2026-07', 'amount_cents' => 40_000],
        ]]);
});

it('rejects budgets on income categories, subcategories and archived categories', function (Closure $makeCategory): void {
    $category = $makeCategory();

    $this->putJson("/api/v1/budgets/{$category->id}", ['amount_cents' => 40_000, 'effective_from' => '2026-10'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['category_id']);

    $this->assertDatabaseCount('budgets', 0);
})->with([
    'income category' => [fn () => Category::factory()->income()->create()],
    'subcategory' => [fn () => Category::factory()->childOf(Category::factory()->create())->create()],
    'archived category' => [fn () => Category::factory()->archived()->create()],
]);

it('validates the amount and the period', function (array $payload, string $field): void {
    $food = Category::factory()->create();

    $this->putJson("/api/v1/budgets/{$food->id}", $payload)
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'missing amount' => [['effective_from' => '2026-10'], 'amount_cents'],
    'negative amount' => [['amount_cents' => -1], 'amount_cents'],
    'decimal amount' => [['amount_cents' => 10.5], 'amount_cents'],
    'amount too large' => [['amount_cents' => 10_000_000_000], 'amount_cents'],
    'invalid period' => [['amount_cents' => 100, 'effective_from' => '2026-13'], 'effective_from'],
    'period without padding' => [['amount_cents' => 100, 'effective_from' => '2026-1'], 'effective_from'],
]);

it('validates the listed period', function (): void {
    $this->getJson('/api/v1/budgets?period=2026-13')->assertUnprocessable()->assertJsonValidationErrors(['period']);
});

it('returns 404 for unknown categories', function (): void {
    $this->putJson('/api/v1/budgets/999999', ['amount_cents' => 100])->assertNotFound();
    $this->getJson('/api/v1/budgets/999999/history')->assertNotFound();
});

it('rejects a budget for an unknown category in the action', function (): void {
    expect(fn () => app(SetBudget::class)->handle(999_999, 100))
        ->toThrow(ValidationException::class);
});

it('refuses to nest a budgeted category under another category', function (): void {
    $food = Category::factory()->create();
    $housing = Category::factory()->create();
    $this->putJson("/api/v1/budgets/{$housing->id}", ['amount_cents' => 40_000])->assertOk();

    $this->patchJson("/api/v1/categories/{$housing->id}", ['parent_id' => $food->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('deletes the budgets of a deleted unused category', function (): void {
    $food = Category::factory()->create();
    $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => 40_000])->assertOk();

    $this->deleteJson("/api/v1/categories/{$food->id}")->assertNoContent();

    $this->assertDatabaseCount('budgets', 0);
});

it('clears every budget row of a category, stops included', function (): void {
    $food = Category::factory()->create();
    $housing = Category::factory()->create();
    foreach ([['2026-07', 40_000], ['2026-09', 0]] as [$label, $amount]) {
        $this->putJson("/api/v1/budgets/{$food->id}", ['amount_cents' => $amount, 'effective_from' => $label])->assertOk();
    }
    $this->putJson("/api/v1/budgets/{$housing->id}", ['amount_cents' => 80_000, 'effective_from' => '2026-07'])->assertOk();

    $this->deleteJson("/api/v1/budgets/{$food->id}")->assertNoContent();

    $this->getJson("/api/v1/budgets/{$food->id}/history")->assertOk()->assertExactJson(['data' => []]);
    expect(budgetFor($food, '2026-08'))->toMatchArray(['amount_cents' => null, 'effective_from' => null])
        ->and(budgetFor($housing, '2026-08')['amount_cents'])->toBe(80_000);
});

it('lets a category whose budget was cleared become a subcategory', function (): void {
    $leisure = Category::factory()->create();
    $coffee = Category::factory()->create();
    Transaction::factory()->expense(350)->create(['category_id' => $coffee->id]);
    $this->putJson("/api/v1/budgets/{$coffee->id}", ['amount_cents' => 3_000, 'effective_from' => '2026-07'])->assertOk();
    $this->putJson("/api/v1/budgets/{$coffee->id}", ['amount_cents' => 0, 'effective_from' => '2026-09'])->assertOk();

    $this->patchJson("/api/v1/categories/{$coffee->id}", ['parent_id' => $leisure->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id' => 'Elimina su presupuesto antes de convertirla en subcategoría.']);

    $this->deleteJson("/api/v1/budgets/{$coffee->id}")->assertNoContent();

    $this->patchJson("/api/v1/categories/{$coffee->id}", ['parent_id' => $leisure->id])
        ->assertOk()
        ->assertJsonPath('data.parent_id', $leisure->id);
});

it('clears an unbudgeted category as a no-op and returns 404 for unknown categories', function (): void {
    $food = Category::factory()->create();

    $this->deleteJson("/api/v1/budgets/{$food->id}")->assertNoContent();
    $this->deleteJson('/api/v1/budgets/999999')->assertNotFound();
});

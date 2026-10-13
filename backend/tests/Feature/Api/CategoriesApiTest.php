<?php

declare(strict_types=1);

use App\Enums\CategoryKind;
use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;

beforeEach(function (): void {
    $this->actingAs(User::factory()->create());
});

it('returns the two-level tree ordered by sort order and name', function (): void {
    $food = Category::factory()->create(['name' => 'Alimentación', 'sort_order' => 1, 'icon' => 'shopping-cart', 'color' => '#2E7D32']);
    $home = Category::factory()->create(['name' => 'Vivienda', 'sort_order' => 0]);
    $market = Category::factory()->childOf($food)->create(['name' => 'Supermercado', 'sort_order' => 0]);
    $bars = Category::factory()->childOf($food)->create(['name' => 'Bares', 'sort_order' => 0]);
    $salary = Category::factory()->income()->create(['name' => 'Nómina']);

    $response = $this->getJson('/api/v1/categories?kind=expense')->assertOk();

    expect($response->json('data.*.id'))->toBe([$home->id, $food->id])
        ->and($response->json('data.1.children.*.id'))->toBe([$bars->id, $market->id])
        ->and($response->json('data.1'))->toBe([
            'id' => $food->id, 'kind' => 'expense', 'name' => 'Alimentación', 'parent_id' => null,
            'icon' => 'shopping-cart', 'color' => '#2E7D32', 'sort_order' => 1, 'archived_at' => null,
            'children' => [
                ['id' => $bars->id, 'kind' => 'expense', 'name' => 'Bares', 'parent_id' => $food->id, 'icon' => null, 'color' => null, 'sort_order' => 0, 'archived_at' => null, 'children' => []],
                ['id' => $market->id, 'kind' => 'expense', 'name' => 'Supermercado', 'parent_id' => $food->id, 'icon' => null, 'color' => null, 'sort_order' => 0, 'archived_at' => null, 'children' => []],
            ],
        ]);

    $this->getJson('/api/v1/categories?kind=income')->assertJsonPath('data.*.id', [$salary->id]);
    $this->getJson('/api/v1/categories')->assertJsonCount(3, 'data');
});

it('hides archived categories unless requested', function (): void {
    $parent = Category::factory()->create();
    Category::factory()->childOf($parent)->archived()->create();
    Category::factory()->archived()->create();

    $this->getJson('/api/v1/categories')
        ->assertJsonCount(1, 'data')
        ->assertJsonCount(0, 'data.0.children');

    $this->getJson('/api/v1/categories?include_archived=1')
        ->assertJsonCount(2, 'data');
});

it('validates the tree query', function (): void {
    $this->getJson('/api/v1/categories?kind=transfer')->assertUnprocessable()->assertJsonValidationErrors(['kind']);
});

it('creates a category and a subcategory', function (): void {
    $parentId = $this->postJson('/api/v1/categories', ['kind' => 'expense', 'name' => 'Mascotas', 'icon' => 'paw-print', 'color' => '#AA00FF'])
        ->assertCreated()
        ->assertJsonPath('data.children', [])
        ->json('data.id');

    $this->postJson('/api/v1/categories', ['kind' => 'expense', 'name' => 'Veterinario', 'parent_id' => $parentId, 'sort_order' => 2])
        ->assertCreated()
        ->assertJsonPath('data.parent_id', $parentId)
        ->assertJsonPath('data.sort_order', 2);
});

it('validates category creation', function (array $payload, string $field): void {
    $expenseParent = Category::factory()->create(['name' => 'Ocio']);
    $incomeParent = Category::factory()->income()->create();
    $subcategory = Category::factory()->childOf($expenseParent)->create(['name' => 'Cine']);
    $archivedParent = Category::factory()->archived()->create();

    $payload = array_map(fn ($value) => match ($value) {
        'income-parent' => $incomeParent->id,
        'subcategory' => $subcategory->id,
        'archived-parent' => $archivedParent->id,
        'expense-parent' => $expenseParent->id,
        default => $value,
    }, $payload);

    $this->postJson('/api/v1/categories', ['kind' => 'expense', 'name' => 'Nueva', ...$payload])
        ->assertUnprocessable()
        ->assertJsonValidationErrors([$field]);
})->with([
    'missing kind' => [['kind' => null], 'kind'],
    'unknown kind' => [['kind' => 'transfer'], 'kind'],
    'missing name' => [['name' => '  '], 'name'],
    'long name' => [['name' => str_repeat('a', 61)], 'name'],
    'duplicate top-level name' => [['name' => 'ocio'], 'name'],
    'duplicate sibling name' => [['name' => 'CINE', 'parent_id' => 'expense-parent'], 'name'],
    'parent of the other kind' => [['parent_id' => 'income-parent'], 'parent_id'],
    'third level' => [['parent_id' => 'subcategory'], 'parent_id'],
    'archived parent' => [['parent_id' => 'archived-parent'], 'parent_id'],
    'unknown parent' => [['parent_id' => 999_999], 'parent_id'],
    'malformed color' => [['color' => 'green'], 'color'],
    'long icon' => [['icon' => str_repeat('i', 41)], 'icon'],
]);

it('allows the same name in another kind', function (): void {
    Category::factory()->create(['name' => 'Otros']);

    $this->postJson('/api/v1/categories', ['kind' => 'income', 'name' => 'Otros'])->assertCreated();
});

it('edits name, icon, color, order and parent', function (): void {
    $first = Category::factory()->create();
    $second = Category::factory()->create();
    $leaf = Category::factory()->childOf($first)->create();

    $this->patchJson("/api/v1/categories/{$leaf->id}", [
        'name' => 'Renombrada', 'icon' => 'star', 'color' => '#123456', 'sort_order' => 4, 'parent_id' => $second->id,
    ])->assertOk()
        ->assertJsonPath('data.name', 'Renombrada')
        ->assertJsonPath('data.icon', 'star')
        ->assertJsonPath('data.color', '#123456')
        ->assertJsonPath('data.sort_order', 4)
        ->assertJsonPath('data.parent_id', $second->id);

    $this->patchJson("/api/v1/categories/{$leaf->id}", ['parent_id' => null, 'icon' => null])
        ->assertOk()
        ->assertJsonPath('data.parent_id', null)
        ->assertJsonPath('data.icon', null);
});

it('never changes the kind of a category', function (): void {
    $category = Category::factory()->create(['kind' => CategoryKind::Expense]);

    $this->patchJson("/api/v1/categories/{$category->id}", ['kind' => 'income'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['kind']);

    $this->patchJson("/api/v1/categories/{$category->id}", ['kind' => 'expense', 'name' => 'Igual'])
        ->assertOk()
        ->assertJsonPath('data.kind', 'expense');
});

it('rejects moving a child under a parent of the other kind', function (): void {
    $expense = Category::factory()->create();
    $income = Category::factory()->income()->create();
    $child = Category::factory()->childOf($expense)->create();

    $this->patchJson("/api/v1/categories/{$child->id}", ['parent_id' => $income->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('rejects nesting a category that has children', function (): void {
    $parent = Category::factory()->create();
    Category::factory()->childOf($parent)->create();
    $other = Category::factory()->create();

    $this->patchJson("/api/v1/categories/{$parent->id}", ['parent_id' => $other->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('rejects a rename colliding with a sibling', function (): void {
    $parent = Category::factory()->create();
    Category::factory()->childOf($parent)->create(['name' => 'Gas']);
    $water = Category::factory()->childOf($parent)->create(['name' => 'Agua']);

    $this->patchJson("/api/v1/categories/{$water->id}", ['name' => 'GAS'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);
});

it('rejects moving a child under a parent that already has a sibling with its name', function (): void {
    $source = Category::factory()->create(['name' => 'Hogar']);
    $target = Category::factory()->create(['name' => 'Suministros']);
    Category::factory()->childOf($target)->create(['name' => 'agua']);
    $water = Category::factory()->childOf($source)->create(['name' => 'Agua']);

    $this->patchJson("/api/v1/categories/{$water->id}", ['parent_id' => $target->id])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id' => 'Ya existe una categoría con ese nombre en el mismo nivel.']);

    expect($water->refresh()->parent_id)->toBe($source->id);
});

it('rejects moving a child to the top level next to a root with its name', function (): void {
    Category::factory()->create(['name' => 'Agua']);
    $water = Category::factory()->childOf(Category::factory()->create())->create(['name' => 'Agua']);

    $this->patchJson("/api/v1/categories/{$water->id}", ['parent_id' => null])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['parent_id']);
});

it('allows moving a child to the top level when the root name is used by the other kind', function (): void {
    Category::factory()->income()->create(['name' => 'Agua']);
    $water = Category::factory()->childOf(Category::factory()->create())->create(['name' => 'Agua']);

    $this->patchJson("/api/v1/categories/{$water->id}", ['parent_id' => null])
        ->assertOk()
        ->assertJsonPath('data.parent_id', null);
});

it('archives and unarchives a category', function (): void {
    $category = Category::factory()->create();

    $this->postJson("/api/v1/categories/{$category->id}/archive")
        ->assertOk()
        ->assertJsonPath('data.archived_at', fn (?string $value) => $value !== null);

    $this->postJson("/api/v1/categories/{$category->id}/unarchive")
        ->assertOk()
        ->assertJsonPath('data.archived_at', null);
});

it('deletes an unused category', function (): void {
    $category = Category::factory()->create();

    $this->deleteJson("/api/v1/categories/{$category->id}")->assertNoContent();
    $this->deleteJson("/api/v1/categories/{$category->id}")->assertNotFound();
});

it('returns 409 when deleting a category with children', function (): void {
    $parent = Category::factory()->create();
    Category::factory()->childOf($parent)->create();

    $this->deleteJson("/api/v1/categories/{$parent->id}")
        ->assertConflict()
        ->assertJson(['code' => 'category_has_children']);
});

it('returns 409 when deleting a category in use', function (): void {
    $category = Category::factory()->create();
    Transaction::factory()->on(Account::factory()->create())->state(['category_id' => $category->id, 'amount_cents' => -100])->create();

    $this->deleteJson("/api/v1/categories/{$category->id}")
        ->assertConflict()
        ->assertJson(['code' => 'category_in_use']);
});

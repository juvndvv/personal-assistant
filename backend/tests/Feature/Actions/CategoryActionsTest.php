<?php

declare(strict_types=1);

use App\Actions\Categories\ArchiveCategory;
use App\Actions\Categories\CreateCategory;
use App\Actions\Categories\DeleteCategory;
use App\Actions\Categories\UnarchiveCategory;
use App\Actions\Categories\UpdateCategory;
use App\Enums\CategoryKind;
use App\Exceptions\DomainConflict;
use App\Models\Account;
use App\Models\Category;
use App\Models\Transaction;
use Illuminate\Validation\ValidationException;

function parentGuardMessage(Closure $callback): string
{
    try {
        $callback();
    } catch (ValidationException $exception) {
        return (string) ($exception->errors()['parent_id'][0] ?? '');
    }

    return '';
}

it('creates top-level categories and subcategories of the same kind', function (): void {
    $parent = app(CreateCategory::class)->handle(['kind' => CategoryKind::Income, 'name' => 'Trabajo']);
    $child = app(CreateCategory::class)->handle(['kind' => CategoryKind::Income, 'name' => 'Bonus', 'parent_id' => $parent->id]);

    expect($child->parent_id)->toBe($parent->id)
        ->and($child->kind)->toBe(CategoryKind::Income);
});

it('never lets a child take the other kind', function (): void {
    $parent = Category::factory()->create(['kind' => CategoryKind::Expense]);

    expect(parentGuardMessage(fn () => app(CreateCategory::class)->handle([
        'kind' => CategoryKind::Income, 'name' => 'Mixta', 'parent_id' => $parent->id,
    ])))->toBe('La categoría padre debe ser del mismo tipo.');
});

it('rejects invalid parents', function (string $scenario, string $message): void {
    $top = Category::factory()->create();
    $child = Category::factory()->childOf($top)->create();
    $archivedTop = Category::factory()->archived()->create();
    $category = Category::factory()->create();

    $parentId = match ($scenario) {
        'subcategory' => $child->id,
        'archived' => $archivedTop->id,
        'missing' => 999_999,
        'self' => $category->id,
    };

    expect(parentGuardMessage(fn () => app(UpdateCategory::class)->handle($category, ['parent_id' => $parentId])))->toBe($message);
})->with([
    ['subcategory', 'La categoría padre debe ser una categoría principal.'],
    ['archived', 'La categoría padre está archivada.'],
    ['missing', 'La categoría padre no existe.'],
    ['self', 'Una categoría no puede ser su propia categoría padre.'],
]);

it('refuses to nest a category that has children', function (): void {
    $top = Category::factory()->create();
    Category::factory()->childOf($top)->create();
    $otherTop = Category::factory()->create();

    expect(parentGuardMessage(fn () => app(UpdateCategory::class)->handle($top, ['parent_id' => $otherTop->id])))
        ->toBe('Una categoría con subcategorías no puede convertirse en subcategoría.');
});

it('moves a leaf category under another parent and back to the top level', function (): void {
    $first = Category::factory()->create();
    $second = Category::factory()->create();
    $leaf = Category::factory()->childOf($first)->create();

    expect(app(UpdateCategory::class)->handle($leaf, ['parent_id' => $second->id])->parent_id)->toBe($second->id)
        ->and(app(UpdateCategory::class)->handle($leaf, ['parent_id' => null])->parent_id)->toBeNull();
});

it('keeps the kind immutable on update', function (): void {
    $category = Category::factory()->create(['kind' => CategoryKind::Expense]);

    $updated = app(UpdateCategory::class)->handle($category, ['kind' => CategoryKind::Income, 'name' => 'Nuevo nombre']);

    expect($updated->kind)->toBe(CategoryKind::Expense)
        ->and($updated->name)->toBe('Nuevo nombre');
});

it('archives and unarchives a category', function (): void {
    $category = Category::factory()->create();

    expect(app(ArchiveCategory::class)->handle($category)->isArchived())->toBeTrue()
        ->and(app(UnarchiveCategory::class)->handle($category)->isArchived())->toBeFalse();
});

it('refuses to delete a category with children', function (): void {
    $top = Category::factory()->create();
    Category::factory()->childOf($top)->create();

    expect(fn () => app(DeleteCategory::class)->handle($top))
        ->toThrow(fn (DomainConflict $conflict) => expect($conflict->errorCode)->toBe('category_has_children'));
});

it('refuses to delete a category referenced by live or deleted movements', function (bool $softDeleted): void {
    $category = Category::factory()->create();
    $movement = Transaction::factory()->on(Account::factory()->create())->state(['category_id' => $category->id, 'amount_cents' => -100])->create();

    if ($softDeleted) {
        $movement->delete();
    }

    expect(fn () => app(DeleteCategory::class)->handle($category))
        ->toThrow(fn (DomainConflict $conflict) => expect($conflict->errorCode)->toBe('category_in_use'));
})->with(['live' => false, 'soft-deleted' => true]);

it('deletes an unused category', function (): void {
    $category = Category::factory()->create();

    app(DeleteCategory::class)->handle($category);

    expect(Category::query()->whereKey($category->id)->exists())->toBeFalse();
});

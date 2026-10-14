<?php

declare(strict_types=1);

namespace App\Domain\Categories;

use App\Models\Budget;
use App\Models\Category;
use Illuminate\Validation\ValidationException;

final class CategoryParentGuard
{
    public function ensureValidParent(Category $category, int $parentId): void
    {
        $parent = Category::query()->find($parentId);

        $error = match (true) {
            $parent === null => 'La categoría padre no existe.',
            $category->exists && $parent->id === $category->id => 'Una categoría no puede ser su propia categoría padre.',
            $parent->kind !== $category->kind => 'La categoría padre debe ser del mismo tipo.',
            ! $parent->isTopLevel() => 'La categoría padre debe ser una categoría principal.',
            $parent->isArchived() => 'La categoría padre está archivada.',
            $category->exists && $category->children()->exists() => 'Una categoría con subcategorías no puede convertirse en subcategoría.',
            $category->exists && Budget::query()->where('category_id', $category->id)->exists() => 'Elimina su presupuesto antes de convertirla en subcategoría.',
            default => null,
        };

        if ($error !== null) {
            throw ValidationException::withMessages(['parent_id' => $error]);
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Models\Category;
use Closure;

final class CategoryRules
{
    public static function uniqueName(string $kind, ?int $parentId, ?int $ignoreCategoryId = null): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($kind, $parentId, $ignoreCategoryId): void {
            if (! is_string($value)) {
                return;
            }

            $taken = Category::query()
                ->where('kind', $kind)
                ->where('parent_id', $parentId)
                ->whereRaw('lower(name) = lower(?)', [trim($value)])
                ->when($ignoreCategoryId !== null, fn ($query) => $query->whereKeyNot($ignoreCategoryId))
                ->exists();

            if ($taken) {
                $fail('Ya existe una categoría con ese nombre en el mismo nivel.');
            }
        };
    }

    /**
     * @return list<string>
     */
    public static function color(): array
    {
        return ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'];
    }
}

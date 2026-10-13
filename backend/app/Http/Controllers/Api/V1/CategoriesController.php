<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Categories\ArchiveCategory;
use App\Actions\Categories\CreateCategory;
use App\Actions\Categories\DeleteCategory;
use App\Actions\Categories\UnarchiveCategory;
use App\Actions\Categories\UpdateCategory;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexCategoriesRequest;
use App\Http\Requests\Api\V1\StoreCategoryRequest;
use App\Http\Requests\Api\V1\UpdateCategoryRequest;
use App\Http\Resources\Api\V1\CategoryResource;
use App\Models\Category;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class CategoriesController extends Controller
{
    public function index(IndexCategoriesRequest $request): AnonymousResourceCollection
    {
        $includeArchived = $request->includeArchived();
        $kind = $request->kind();

        $categories = Category::query()
            ->whereNull('parent_id')
            ->when($kind !== null, fn (Builder $query) => $query->where('kind', $kind))
            ->when(! $includeArchived, fn (Builder $query) => $query->whereNull('archived_at'))
            ->with(['children' => function (HasMany $query) use ($includeArchived): void {
                $query->ordered()->when(! $includeArchived, fn ($children) => $children->whereNull('archived_at'));
            }])
            ->orderBy('kind')
            ->ordered()
            ->get();

        return CategoryResource::collection($categories->map(fn (Category $category): CategoryResource => new CategoryResource($category)));
    }

    public function store(StoreCategoryRequest $request, CreateCategory $createCategory): JsonResponse
    {
        return $this->resource($createCategory->handle($request->validated()))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function update(UpdateCategoryRequest $request, Category $category, UpdateCategory $updateCategory): CategoryResource
    {
        return $this->resource($updateCategory->handle($category, $request->validated()));
    }

    public function archive(Category $category, ArchiveCategory $archiveCategory): CategoryResource
    {
        return $this->resource($archiveCategory->handle($category));
    }

    public function unarchive(Category $category, UnarchiveCategory $unarchiveCategory): CategoryResource
    {
        return $this->resource($unarchiveCategory->handle($category));
    }

    public function destroy(Category $category, DeleteCategory $deleteCategory): Response
    {
        $deleteCategory->handle($category);

        return response()->noContent();
    }

    private function resource(Category $category): CategoryResource
    {
        return new CategoryResource($category->load(['children' => fn (HasMany $query) => $query->ordered()]));
    }
}

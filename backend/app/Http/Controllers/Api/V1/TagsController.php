<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Tags\CreateTag;
use App\Actions\Tags\DeleteTag;
use App\Actions\Tags\RenameTag;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexTagsRequest;
use App\Http\Requests\Api\V1\TagNameRequest;
use App\Http\Resources\Api\V1\TagResource;
use App\Models\Tag;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class TagsController extends Controller
{
    public const int LIST_LIMIT = 50;

    public function index(IndexTagsRequest $request): AnonymousResourceCollection
    {
        $search = $request->search();

        $tags = Tag::query()
            ->withCount('transactions')
            ->when($search !== null, fn (Builder $query) => $query->whereRaw(
                'public.f_unaccent(lower(name)) LIKE public.f_unaccent(lower(?))',
                ['%'.addcslashes((string) $search, '\\%_').'%'],
            ))
            ->orderByDesc('transactions_count')
            ->orderBy('name')
            ->limit(self::LIST_LIMIT)
            ->get();

        return TagResource::collection($tags->map(fn (Tag $tag): TagResource => new TagResource(
            $tag,
            is_numeric($tag->getAttribute('transactions_count')) ? (int) $tag->getAttribute('transactions_count') : 0,
        )));
    }

    public function store(TagNameRequest $request, CreateTag $createTag): JsonResponse
    {
        $tag = $createTag->handle($request->tagName());

        return (new TagResource($tag))
            ->response()
            ->setStatusCode($tag->wasRecentlyCreated ? Response::HTTP_CREATED : Response::HTTP_OK);
    }

    public function update(TagNameRequest $request, Tag $tag, RenameTag $renameTag): TagResource
    {
        return new TagResource($renameTag->handle($tag, $request->tagName()));
    }

    public function destroy(Tag $tag, DeleteTag $deleteTag): Response
    {
        $deleteTag->handle($tag);

        return response()->noContent();
    }
}

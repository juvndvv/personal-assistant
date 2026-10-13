<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Drafts\DiscardDraft;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListDraftsRequest;
use App\Http\Resources\Api\V1\DraftResource;
use App\Models\Draft;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class DraftsController extends Controller
{
    public function index(ListDraftsRequest $request): AnonymousResourceCollection
    {
        $origins = $request->origins();

        $page = Draft::query()
            ->with(DraftResource::RELATIONS)
            ->where('status', $request->status()->value)
            ->when($origins !== [], fn ($query) => $query->whereIn('origin', $origins))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($request->perPage())
            ->withQueryString();

        return DraftResource::collection($page);
    }

    public function show(Draft $draft): DraftResource
    {
        return new DraftResource($draft->loadMissing(DraftResource::RELATIONS));
    }

    public function discard(Draft $draft, DiscardDraft $discardDraft): DraftResource
    {
        return new DraftResource($discardDraft->handle($draft)->load(DraftResource::RELATIONS));
    }
}

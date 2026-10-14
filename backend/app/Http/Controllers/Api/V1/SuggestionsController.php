<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Suggestions\SuggestCategorization;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\CategorizationSuggestionRequest;
use App\Http\Resources\Api\V1\CategorizationSuggestionResource;
use Illuminate\Http\Response;

final class SuggestionsController extends Controller
{
    public function categorization(CategorizationSuggestionRequest $request, SuggestCategorization $suggestCategorization): CategorizationSuggestionResource|Response
    {
        $suggestion = $suggestCategorization->handle($request->kind(), $request->merchant(), $request->description());

        return $suggestion === null ? response()->noContent() : new CategorizationSuggestionResource($suggestion);
    }
}

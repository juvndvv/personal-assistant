<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Recurring\CreateRecurringTemplate;
use App\Actions\Recurring\DeleteRecurringTemplate;
use App\Actions\Recurring\PauseRecurringTemplate;
use App\Actions\Recurring\ResumeRecurringTemplate;
use App\Actions\Recurring\UpdateRecurringTemplate;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\IndexRecurringTemplatesRequest;
use App\Http\Requests\Api\V1\StoreRecurringTemplateRequest;
use App\Http\Requests\Api\V1\UpdateRecurringTemplateRequest;
use App\Http\Resources\Api\V1\RecurringTemplateResource;
use App\Models\RecurringTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class RecurringTemplatesController extends Controller
{
    public function index(IndexRecurringTemplatesRequest $request): AnonymousResourceCollection
    {
        $templates = RecurringTemplate::query()
            ->with(RecurringTemplateResource::RELATIONS)
            ->when(! $request->includePaused(), fn ($query) => $query->whereNull('paused_at'))
            ->orderByRaw('lower(name)')
            ->orderBy('id')
            ->get();

        return RecurringTemplateResource::collection($templates);
    }

    public function store(StoreRecurringTemplateRequest $request, CreateRecurringTemplate $createTemplate): JsonResponse
    {
        return $this->resource($createTemplate->handle($request->templateAttributes()))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(RecurringTemplate $recurringTemplate): RecurringTemplateResource
    {
        return $this->resource($recurringTemplate);
    }

    public function update(UpdateRecurringTemplateRequest $request, RecurringTemplate $recurringTemplate, UpdateRecurringTemplate $updateTemplate): RecurringTemplateResource
    {
        return $this->resource($updateTemplate->handle($recurringTemplate, $request->templateAttributes()));
    }

    public function destroy(RecurringTemplate $recurringTemplate, DeleteRecurringTemplate $deleteTemplate): Response
    {
        $deleteTemplate->handle($recurringTemplate);

        return response()->noContent();
    }

    public function pause(RecurringTemplate $recurringTemplate, PauseRecurringTemplate $pauseTemplate): RecurringTemplateResource
    {
        return $this->resource($pauseTemplate->handle($recurringTemplate));
    }

    public function resume(RecurringTemplate $recurringTemplate, ResumeRecurringTemplate $resumeTemplate): RecurringTemplateResource
    {
        return $this->resource($resumeTemplate->handle($recurringTemplate));
    }

    private function resource(RecurringTemplate $template): RecurringTemplateResource
    {
        return new RecurringTemplateResource($template->load(RecurringTemplateResource::RELATIONS));
    }
}

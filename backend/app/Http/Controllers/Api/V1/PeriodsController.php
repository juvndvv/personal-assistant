<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Period\Period;
use App\Domain\Period\PeriodResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\CurrentPeriodRequest;
use App\Http\Requests\Api\V1\ListPeriodsRequest;
use App\Http\Requests\Api\V1\ResolvePeriodRequest;
use App\Http\Resources\Api\V1\PeriodResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class PeriodsController extends Controller
{
    public function current(CurrentPeriodRequest $request, PeriodResolver $resolver): PeriodResource
    {
        $previewStartDay = $request->previewStartDay();

        if ($previewStartDay !== null) {
            $resolver = new PeriodResolver($previewStartDay);
        }

        return new PeriodResource($resolver->current());
    }

    public function index(ListPeriodsRequest $request, PeriodResolver $resolver): AnonymousResourceCollection
    {
        $until = $request->until();
        $periods = $resolver->lastN($request->count(), $until === null ? null : $resolver->fromLabel($until));

        return PeriodResource::collection(collect($periods)->map(fn (Period $period): PeriodResource => new PeriodResource($period)));
    }

    public function resolve(ResolvePeriodRequest $request, PeriodResolver $resolver): PeriodResource
    {
        return new PeriodResource($resolver->forDate($request->resolvedDate()));
    }
}

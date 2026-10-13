<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Recurring\RecurringForecast;
use App\Domain\Period\PeriodResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\RecurringForecastRequest;
use App\Http\Resources\Api\V1\RecurringForecastResource;

final class RecurringForecastController extends Controller
{
    public function show(RecurringForecastRequest $request, PeriodResolver $periods, RecurringForecast $forecast): RecurringForecastResource
    {
        return new RecurringForecastResource($forecast->handle($request->period($periods)));
    }
}

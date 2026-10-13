<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Period\PeriodResolver;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\NetWorthRequest;
use App\Http\Requests\Api\V1\ReportPeriodRequest;
use App\Http\Requests\Api\V1\TrendReportRequest;
use App\Http\Resources\Api\V1\CaptureMetricsResource;
use App\Http\Resources\Api\V1\NetWorthResource;
use App\Http\Resources\Api\V1\PeriodSummaryResource;
use App\Http\Resources\Api\V1\TrendResource;
use App\Reports\CaptureMetricsReport;
use App\Reports\NetWorthReport;
use App\Reports\PeriodSummaryReport;
use App\Reports\TrendReport;
use Carbon\CarbonImmutable;

final class ReportsController extends Controller
{
    public function summary(ReportPeriodRequest $request, PeriodResolver $periods, PeriodSummaryReport $report): PeriodSummaryResource
    {
        return new PeriodSummaryResource($report->forPeriod($request->period($periods)));
    }

    public function trend(TrendReportRequest $request, PeriodResolver $periods, TrendReport $report): TrendResource
    {
        return new TrendResource($report->forPeriods($request->periods($periods), $request->categoryId()));
    }

    public function netWorth(NetWorthRequest $request, NetWorthReport $report): NetWorthResource
    {
        return new NetWorthResource($report->at($request->valuationDate(), CarbonImmutable::today()));
    }

    public function captureMetrics(ReportPeriodRequest $request, PeriodResolver $periods, CaptureMetricsReport $report): CaptureMetricsResource
    {
        return new CaptureMetricsResource($report->forPeriod($request->period($periods), CarbonImmutable::now()));
    }
}

<?php

declare(strict_types=1);

namespace App\Reports;

use App\Domain\Period\Period;
use App\Enums\DraftStatus;
use App\Enums\TransactionOrigin;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class CaptureMetricsReport
{
    private const array CAPTURE_ORIGINS = [TransactionOrigin::Manual, TransactionOrigin::Voice, TransactionOrigin::Photo];

    public function forPeriod(Period $period, CarbonImmutable $today): CaptureMetrics
    {
        $lastElapsedDay = $today->lessThan($period->end) ? $today->startOfDay() : $period->end;
        $elapsedDays = $lastElapsedDay->lessThan($period->start) ? 0 : (int) round($period->start->diffInDays($lastElapsedDay)) + 1;

        $confirmations = $this->confirmations($period);

        return new CaptureMetrics(
            period: $period,
            capturesConfirmed: self::integer($confirmations->confirmed ?? 0),
            medianMillisecondsToConfirm: self::nullableInteger($confirmations->median_ms ?? null),
            p90MillisecondsToConfirm: self::nullableInteger($confirmations->p90_ms ?? null),
            capturesUnedited: self::integer($confirmations->unedited ?? 0),
            activeDays: $elapsedDays === 0 ? 0 : $this->activeDays($period->start, $lastElapsedDay),
            elapsedDays: $elapsedDays,
        );
    }

    private function confirmations(Period $period): ?object
    {
        $durations = DB::table('drafts')
            ->join('captures', 'captures.id', '=', 'drafts.capture_id')
            ->where('drafts.status', DraftStatus::Confirmed->value)
            ->where('drafts.confirmed_at', '>=', self::startOfDay($period->start))
            ->where('drafts.confirmed_at', '<', self::startOfDay($period->end->addDay()))
            ->selectRaw('GREATEST(EXTRACT(EPOCH FROM drafts.confirmed_at - COALESCE(captures.client_started_at, captures.created_at)), 0) AS seconds')
            ->selectRaw('COALESCE(jsonb_array_length(drafts.corrected_fields), 0) = 0 AS unedited');

        return DB::query()
            ->fromSub($durations, 'durations')
            ->selectRaw('COUNT(*) AS confirmed')
            ->selectRaw('ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds) * 1000) AS median_ms')
            ->selectRaw('ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY seconds) * 1000) AS p90_ms')
            ->selectRaw('COUNT(*) FILTER (WHERE unedited) AS unedited')
            ->first();
    }

    private function activeDays(CarbonImmutable $firstDay, CarbonImmutable $lastDay): int
    {
        $row = Transaction::reportable()
            ->whereIn('origin', array_map(fn (TransactionOrigin $origin): string => $origin->value, self::CAPTURE_ORIGINS))
            ->where('created_at', '>=', self::startOfDay($firstDay))
            ->where('created_at', '<', self::startOfDay($lastDay->addDay()))
            ->toBase()
            ->selectRaw('COUNT(DISTINCT (created_at AT TIME ZONE ?)::date) AS active_days', [self::timezone()])
            ->first();

        return self::integer($row->active_days ?? 0);
    }

    private static function startOfDay(CarbonImmutable $date): string
    {
        return CarbonImmutable::parse($date->toDateString(), self::timezone())->toIso8601String();
    }

    private static function timezone(): string
    {
        $timezone = config('app.timezone');

        return is_string($timezone) ? $timezone : 'Europe/Madrid';
    }

    private static function integer(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private static function nullableInteger(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }
}

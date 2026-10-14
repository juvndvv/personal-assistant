<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Exports\ExportFullArchive;
use App\Actions\Exports\ExportTransactionsCsv;
use App\Domain\Period\PeriodResolver;
use App\Enums\CsvDelimiter;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ExportArchiveRequest;
use App\Http\Requests\Api\V1\ListTransactionsRequest;
use Carbon\CarbonImmutable;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

final class ExportsController extends Controller
{
    public function transactions(ListTransactionsRequest $request, PeriodResolver $periods, ExportTransactionsCsv $export): StreamedResponse
    {
        $request->validate(['delimiter' => ['sometimes', Rule::enum(CsvDelimiter::class)]]);

        $filters = $request->filters($periods);
        $delimiter = CsvDelimiter::tryFrom($request->string('delimiter')->toString()) ?? CsvDelimiter::Semicolon;

        return response()->streamDownload(function () use ($export, $filters, $delimiter): void {
            $output = fopen('php://output', 'wb');

            if ($output !== false) {
                $export->handle($filters, $delimiter, $output);
                fclose($output);
            }
        }, self::fileName('movimientos', 'csv'), [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function full(ExportArchiveRequest $request, ExportFullArchive $export): BinaryFileResponse
    {
        $path = $export->handle($request->includeReceipts(), $request->delimiter());

        return response()
            ->download($path, self::fileName('finanzas', 'zip'), [
                'Content-Type' => 'application/zip',
                'Cache-Control' => 'no-store, private',
                'X-Content-Type-Options' => 'nosniff',
            ])
            ->deleteFileAfterSend();
    }

    private static function fileName(string $prefix, string $extension): string
    {
        return sprintf('%s-%s.%s', $prefix, CarbonImmutable::now()->format('Y-m-d-His'), $extension);
    }
}

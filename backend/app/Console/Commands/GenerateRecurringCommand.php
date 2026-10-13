<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Recurring\GenerateRecurringTransactions;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'app:recurring:generate')]
final class GenerateRecurringCommand extends Command
{
    protected $signature = 'app:recurring:generate {--date= : Generate every occurrence due on or before this YYYY-MM-DD date (default today)}';

    protected $description = 'Post the due recurring movements and create drafts for variable ones';

    public function handle(GenerateRecurringTransactions $generator): int
    {
        $asOf = $this->asOf();

        if ($asOf === null) {
            $this->error('The --date option must be a YYYY-MM-DD date.');

            return self::FAILURE;
        }

        $report = $generator->handle($asOf);

        $this->info(sprintf(
            'Recurring as of %s: %d posted, %d awaiting amount, %d skipped.',
            $asOf->toDateString(),
            $report->posted,
            $report->awaitingAmount,
            $report->skipped,
        ));

        if ($report->failures === []) {
            return self::SUCCESS;
        }

        foreach ($report->failures as $failure) {
            $this->error($failure);
        }

        $this->error(sprintf('%d occurrence(s) failed.', count($report->failures)));

        return self::FAILURE;
    }

    private function asOf(): ?CarbonImmutable
    {
        $option = $this->option('date');

        if ($option === null) {
            return CarbonImmutable::today();
        }

        if (! is_string($option) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $option) !== 1) {
            return null;
        }

        $date = CarbonImmutable::createFromFormat('!Y-m-d', $option);

        return $date?->toDateString() === $option ? $date : null;
    }
}

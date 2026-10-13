<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\QuickAdd\QuickAddDefaults;
use App\Ai\CaptureInput;
use App\Ai\CaptureProcessor;
use App\Ai\ExtractionCatalog;
use App\Ai\SanitizeExtraction;
use App\Enums\CaptureKind;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Finder\Finder;

#[AsCommand(name: 'app:ai-eval')]
final class AiEvalCommand extends Command
{
    public const string DISK = 'ai-eval';

    private const array MIMES = [
        'm4a' => 'audio/mp4',
        'aac' => 'audio/aac',
        'webm' => 'audio/webm',
        'ogg' => 'audio/ogg',
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
    ];

    private const array TEXT_FIELDS = ['description', 'merchant'];

    protected $signature = 'app:ai-eval {dir : Directory with samples and their *.expected.json files}';

    protected $description = 'Run anonymized voice and receipt samples through the configured AI provider and report accuracy and latency';

    public function handle(CaptureProcessor $processor, SanitizeExtraction $sanitizer, QuickAddDefaults $quickAddDefaults): int
    {
        $directory = $this->argument('dir');

        if (! is_string($directory) || ! is_dir($directory)) {
            $this->error('The sample directory does not exist.');

            return self::FAILURE;
        }

        config(['filesystems.disks.'.self::DISK => ['driver' => 'local', 'root' => realpath($directory), 'throw' => true]]);

        $catalog = ExtractionCatalog::current();
        $defaultAccountId = $quickAddDefaults->defaultAccountId();
        $hits = [];
        $totals = [];
        $latencies = [];
        $rows = [];

        foreach ($this->samples($directory) as [$file, $mime, $expected]) {
            $today = isset($expected['today']) && is_string($expected['today'])
                ? (CarbonImmutable::createFromFormat('!Y-m-d', $expected['today']) ?: CarbonImmutable::today())
                : CarbonImmutable::today();
            unset($expected['today']);

            $kind = str_starts_with($mime, 'image/') ? CaptureKind::Photo : CaptureKind::Voice;
            $result = $processor->process(new CaptureInput($kind, self::DISK, $file, $mime), $catalog, $today);
            $proposal = $sanitizer->handle($result, $catalog, $today, $defaultAccountId);
            $latencies[] = $result->totalMs;

            $misses = [];

            foreach ($expected as $field => $value) {
                $totals[$field] = ($totals[$field] ?? 0) + 1;
                $actual = $proposal->values[$field] ?? null;

                if (self::matches($field, $value, $actual)) {
                    $hits[$field] = ($hits[$field] ?? 0) + 1;
                } else {
                    $misses[] = sprintf('%s=%s (expected %s)', $field, json_encode($actual), json_encode($value));
                }
            }

            $rows[] = [$file, $result->successful ? 'ok' : 'failed: '.$result->error, $result->totalMs, implode('; ', $misses)];
        }

        if ($rows === []) {
            $this->warn('No samples with a matching *.expected.json file were found.');

            return self::FAILURE;
        }

        $this->table(['Sample', 'Status', 'ms', 'Mismatches'], $rows);

        $this->table(['Field', 'Correct', 'Total', 'Accuracy'], array_map(
            fn (string $field): array => [
                $field,
                $hits[$field] ?? 0,
                $totals[$field],
                sprintf('%.1f %%', 100 * ($hits[$field] ?? 0) / $totals[$field]),
            ],
            array_keys($totals),
        ));

        sort($latencies);
        $this->info(sprintf(
            'Latency over %d samples: p50 %d ms, p90 %d ms, max %d ms.',
            count($latencies),
            self::percentile($latencies, 50),
            self::percentile($latencies, 90),
            $latencies[count($latencies) - 1],
        ));

        return self::SUCCESS;
    }

    /**
     * @return iterable<array{string, string, array<string, mixed>}>
     */
    private function samples(string $directory): iterable
    {
        $finder = Finder::create()->files()->in($directory)->depth(0)->sortByName();

        foreach ($finder as $file) {
            $mime = self::MIMES[strtolower($file->getExtension())] ?? null;
            $expectedPath = $file->getPath().'/'.$file->getFilenameWithoutExtension().'.expected.json';

            if ($mime === null || ! is_file($expectedPath)) {
                continue;
            }

            $expected = json_decode((string) file_get_contents($expectedPath), true);

            if (! is_array($expected)) {
                $this->warn("Skipping {$file->getFilename()}: invalid expected JSON.");

                continue;
            }

            $fields = [];

            foreach ($expected as $key => $value) {
                $fields[(string) $key] = $value;
            }

            yield [$file->getFilename(), $mime, $fields];
        }
    }

    private static function matches(string $field, mixed $expected, mixed $actual): bool
    {
        if (in_array($field, self::TEXT_FIELDS, true) && is_string($expected) && is_string($actual)) {
            return mb_strtolower(trim($expected)) === mb_strtolower(trim($actual));
        }

        return $expected === $actual;
    }

    /**
     * @param  list<int>  $sorted
     */
    private static function percentile(array $sorted, int $percentile): int
    {
        $index = (int) ceil($percentile / 100 * count($sorted)) - 1;

        return $sorted[max(0, $index)];
    }
}

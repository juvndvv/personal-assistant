<?php

declare(strict_types=1);

namespace App\Ai;

use App\Ai\Agents\TransactionExtractor;
use App\Domain\Attachments\ReceiptMime;
use App\Enums\CaptureKind;
use Carbon\CarbonImmutable;
use Laravel\Ai\Exceptions\FailoverableException;
use Laravel\Ai\Files\Image;
use Laravel\Ai\Files\StoredAudio;
use Laravel\Ai\Responses\AgentResponse;
use Laravel\Ai\Responses\StructuredAgentResponse;
use Laravel\Ai\Transcription;
use RuntimeException;
use Throwable;

final class CaptureProcessor
{
    public const string VOICE_PROMPT = 'Extract the movement from this voice transcript:';

    public const string PHOTO_PROMPT = 'Extract the movement from the attached receipt photo.';

    private ?string $provider = null;

    private ?string $model = null;

    public function process(CaptureInput $input, ExtractionCatalog $catalog, CarbonImmutable $today): ExtractionResult
    {
        $startedAt = CarbonImmutable::now();
        $deadline = $startedAt->addSeconds(self::deadlineSeconds());
        $transcript = null;
        $transcriptionMs = null;
        $this->provider = null;
        $this->model = null;

        try {
            if ($input->kind === CaptureKind::Voice) {
                $transcript = $this->transcribe($input, $deadline);
                $transcriptionMs = self::millisecondsSince($startedAt);
            }

            $extraction = $this->extract($input, $transcript, $catalog, $today, $deadline);

            return new ExtractionResult(
                successful: true,
                transcript: $transcript,
                extraction: $extraction,
                error: null,
                provider: $this->provider,
                model: $this->model,
                transcriptionMs: $transcriptionMs,
                totalMs: self::millisecondsSince($startedAt),
            );
        } catch (Throwable $exception) {
            report($exception);

            return new ExtractionResult(
                successful: false,
                transcript: $transcript,
                extraction: null,
                error: CaptureFailureMessage::for($exception),
                provider: $this->provider,
                model: $this->model,
                transcriptionMs: $transcriptionMs,
                totalMs: self::millisecondsSince($startedAt),
            );
        }
    }

    private function transcribe(CaptureInput $input, CarbonImmutable $deadline): string
    {
        $extension = ReceiptMime::extension($input->mime);
        $audio = (new StoredAudio($input->path, $input->disk))
            ->as('audio.'.$extension)
            ->withMimeType($input->mime);

        $provider = self::configString('ai.finance.transcription.provider') ?? self::configString('ai.default_for_transcription');
        $model = self::configString('ai.finance.transcription.model');
        $this->provider = $provider;
        $this->model = $model;

        $response = Transcription::of($audio)
            ->language('es')
            ->timeout(self::timeoutWithin($deadline))
            ->generate(provider: $provider, model: $model);

        $text = trim($response->text);

        if ($text === '') {
            throw UnusableCaptureOutput::noSpeech();
        }

        return $text;
    }

    /**
     * @return array<string, mixed>
     */
    private function extract(
        CaptureInput $input,
        ?string $transcript,
        ExtractionCatalog $catalog,
        CarbonImmutable $today,
        CarbonImmutable $deadline,
    ): array {
        $provider = self::configString('ai.finance.extraction.provider') ?? self::configString('ai.default') ?? '';
        $model = self::configString('ai.finance.extraction.model');
        $this->provider = $provider;
        $this->model = $model;

        $prompt = $transcript === null
            ? self::PHOTO_PROMPT
            : self::VOICE_PROMPT."\n\n".$transcript;
        $attachments = $input->kind === CaptureKind::Photo
            ? [Image::fromStorage($input->path, $input->disk)->withMimeType($input->mime)]
            : [];
        $extractor = new TransactionExtractor($today, $catalog);
        $candidates = [$provider => $model, ...array_fill_keys(array_diff(self::failoverProviders(), [$provider]), null)];
        $lastProvider = array_key_last($candidates);

        foreach ($candidates as $candidate => $candidateModel) {
            $timeout = self::timeoutWithin($deadline);
            $this->provider = (string) $candidate;
            $this->model = $candidateModel;

            try {
                $response = $extractor->prompt(
                    $prompt,
                    attachments: $attachments,
                    provider: (string) $candidate,
                    model: $candidateModel,
                    timeout: $timeout,
                );
            } catch (FailoverableException $exception) {
                if ($candidate === $lastProvider) {
                    throw $exception;
                }

                report($exception);

                continue;
            }

            $this->provider = $response->meta->provider ?? (string) $candidate;
            $this->model = $response->meta->model ?? $candidateModel;

            return self::structured($response);
        }

        throw new RuntimeException('No AI providers were configured.');
    }

    /**
     * @return array<string, mixed>
     */
    private static function structured(AgentResponse $response): array
    {
        $structured = $response instanceof StructuredAgentResponse
            ? $response->structured
            : json_decode($response->text, true);

        if (! is_array($structured)) {
            throw UnusableCaptureOutput::unstructured();
        }

        $result = [];

        foreach ($structured as $key => $value) {
            $result[(string) $key] = $value;
        }

        return $result;
    }

    private static function timeoutWithin(CarbonImmutable $deadline): int
    {
        $remaining = (int) floor(CarbonImmutable::now()->diffInMilliseconds($deadline, false) / 1000);

        if ($remaining < 1) {
            throw CaptureDeadlineExceeded::after(self::deadlineSeconds());
        }

        return min(self::providerTimeoutSeconds(), $remaining);
    }

    private static function millisecondsSince(CarbonImmutable $start): int
    {
        return max(0, (int) round($start->diffInMilliseconds(CarbonImmutable::now())));
    }

    public static function deadlineSeconds(): int
    {
        $value = config('finance.capture.deadline_seconds');

        return is_numeric($value) ? max(1, (int) $value) : 15;
    }

    private static function providerTimeoutSeconds(): int
    {
        $value = config('ai.finance.timeout_seconds');

        return is_numeric($value) ? max(1, (int) $value) : 12;
    }

    /**
     * @return list<string>
     */
    private static function failoverProviders(): array
    {
        $value = config('ai.finance.failover');

        return is_array($value) ? array_values(array_filter($value, fn (mixed $item): bool => is_string($item) && $item !== '')) : [];
    }

    private static function configString(string $key): ?string
    {
        $value = config($key);

        return is_string($value) && $value !== '' ? $value : null;
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Captures;

use App\Actions\Attachments\StoreReceiptFile;
use App\Actions\QuickAdd\QuickAddDefaults;
use App\Ai\CaptureInput;
use App\Ai\CaptureProcessor;
use App\Ai\DraftProposal;
use App\Ai\ExtractionCatalog;
use App\Ai\ExtractionResult;
use App\Ai\SanitizeExtraction;
use App\Enums\CaptureKind;
use App\Enums\CaptureStatus;
use App\Enums\DraftStatus;
use App\Enums\DraftType;
use App\Models\Attachment;
use App\Models\Capture;
use App\Models\Draft;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Throwable;

final readonly class CreateCapture
{
    public function __construct(
        private StoreReceiptFile $storeReceiptFile,
        private CaptureProcessor $processor,
        private SanitizeExtraction $sanitizer,
        private QuickAddDefaults $quickAddDefaults,
    ) {}

    public function handle(CaptureKind $kind, UploadedFile $file, string $mime, ?CarbonImmutable $clientStartedAt = null): Draft
    {
        $attachment = $this->storeReceiptFile->handle($file, $kind->attachmentKind(), $mime);

        try {
            $capture = DB::transaction(function () use ($kind, $clientStartedAt, $attachment): Capture {
                $capture = new Capture;
                $capture->kind = $kind;
                $capture->status = CaptureStatus::Processing;
                $capture->client_started_at = $clientStartedAt;
                $capture->save();

                $attachment->capture_id = $capture->id;
                $attachment->save();

                return $capture;
            });
        } catch (Throwable $exception) {
            StoreReceiptFile::deleteFile($attachment);

            throw $exception;
        }

        $today = CarbonImmutable::today();
        $catalog = ExtractionCatalog::current();
        $result = $this->processor->process(
            new CaptureInput($kind, $attachment->disk, $attachment->path, $attachment->mime),
            $catalog,
            $today,
        );
        $proposal = $this->sanitizer->handle($result, $catalog, $today, $this->quickAddDefaults->defaultAccountId());

        try {
            $draft = DB::transaction(fn (): Draft => $this->complete($capture, $result, $proposal));
        } catch (Throwable $exception) {
            $this->discardCapture($capture, $attachment);

            throw $exception;
        }

        $capture->setRelation('attachments', $capture->newCollection([$attachment]));
        $draft->setRelation('capture', $capture);

        return $draft;
    }

    private function complete(Capture $capture, ExtractionResult $result, DraftProposal $proposal): Draft
    {
        $capture->status = $result->successful ? CaptureStatus::Completed : CaptureStatus::Failed;
        $capture->transcript = $capture->kind === CaptureKind::Voice ? $result->transcript : null;
        $capture->raw_extraction = $result->extraction;
        $capture->error = $result->error;
        $capture->provider = $result->provider === null ? null : mb_substr($result->provider, 0, 40);
        $capture->model = $result->model === null ? null : mb_substr($result->model, 0, 80);
        $capture->transcription_ms = $result->transcriptionMs;
        $capture->extraction_ms = $result->totalMs;
        $capture->save();

        $values = $proposal->values;

        $draft = new Draft;
        $draft->origin = $capture->kind->draftOrigin();
        $draft->status = DraftStatus::Pending;
        $draft->capture_id = $capture->id;
        $draft->type = $values['type'] === null ? null : DraftType::from($values['type']);
        $draft->amount_cents = $values['amount_cents'];
        $draft->date = $values['date'] === null ? null : (CarbonImmutable::createFromFormat('!Y-m-d', $values['date']) ?: null);
        $draft->account_id = $values['account_id'];
        $draft->to_account_id = $values['to_account_id'];
        $draft->category_id = $values['category_id'];
        $draft->description = $values['description'];
        $draft->merchant = $values['merchant'];
        $draft->confidence = $proposal->confidence;
        $draft->field_sources = $proposal->fieldSources;
        $draft->low_confidence_fields = $proposal->lowConfidenceFields;
        $draft->save();

        return $draft->refresh();
    }

    private function discardCapture(Capture $capture, Attachment $attachment): void
    {
        DB::transaction(function () use ($capture, $attachment): void {
            Attachment::query()->whereKey($attachment->id)->delete();
            Capture::query()->whereKey($capture->id)->delete();
        });

        StoreReceiptFile::deleteFile($attachment);
    }
}

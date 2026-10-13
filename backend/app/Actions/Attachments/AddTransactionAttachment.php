<?php

declare(strict_types=1);

namespace App\Actions\Attachments;

use App\Enums\AttachmentKind;
use App\Enums\TransactionType;
use App\Models\Attachment;
use App\Models\Transaction;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Throwable;

final readonly class AddTransactionAttachment
{
    public function __construct(private StoreReceiptFile $storeReceiptFile) {}

    public function handle(Transaction $transaction, UploadedFile $file, AttachmentKind $kind, string $mime): Attachment
    {
        if ($transaction->type === TransactionType::Adjustment) {
            throw ValidationException::withMessages([
                'file' => 'Los ajustes de saldo no admiten justificantes.',
            ]);
        }

        $attachment = $this->storeReceiptFile->handle($file, $kind, $mime);
        $attachment->transaction_id = $transaction->id;

        try {
            $attachment->save();
        } catch (Throwable $exception) {
            StoreReceiptFile::deleteFile($attachment);

            throw $exception;
        }

        return $attachment;
    }
}

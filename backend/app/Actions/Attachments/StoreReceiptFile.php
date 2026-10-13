<?php

declare(strict_types=1);

namespace App\Actions\Attachments;

use App\Domain\Attachments\ReceiptMime;
use App\Enums\AttachmentKind;
use App\Models\Attachment;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

final class StoreReceiptFile
{
    private const int ORIGINAL_NAME_MAX = 255;

    public function handle(UploadedFile $file, AttachmentKind $kind, string $mime): Attachment
    {
        $realPath = $file->getRealPath();
        $hash = $realPath === false ? false : hash_file('sha256', $realPath);

        if ($hash === false) {
            throw new RuntimeException('The uploaded file cannot be read.');
        }

        $id = Str::lower((string) Str::ulid());
        $directory = CarbonImmutable::now()->format('Y/m');
        $fileName = $id.'.'.ReceiptMime::extension($mime);

        $path = Storage::disk(Attachment::DISK)->putFileAs($directory, $file, $fileName);

        if ($path === false) {
            throw new RuntimeException('The receipt could not be stored.');
        }

        $attachment = new Attachment;
        $attachment->id = $id;
        $attachment->kind = $kind;
        $attachment->disk = Attachment::DISK;
        $attachment->path = $path;
        $attachment->mime = $mime;
        $attachment->size_bytes = (int) $file->getSize();
        $attachment->sha256 = $hash;
        $attachment->original_name = self::originalName($file);

        return $attachment;
    }

    public static function deleteFile(Attachment $attachment): void
    {
        Storage::disk($attachment->disk)->delete($attachment->path);
    }

    private static function originalName(UploadedFile $file): ?string
    {
        $name = trim($file->getClientOriginalName());

        if ($name === '' || ! mb_check_encoding($name, 'UTF-8')) {
            return null;
        }

        return mb_substr(basename($name), 0, self::ORIGINAL_NAME_MAX);
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\V1;

use App\Domain\Attachments\ReceiptMime;
use App\Enums\AttachmentKind;
use Closure;
use Illuminate\Http\UploadedFile;

final class ReceiptFileRules
{
    public const string INVALID_FORMAT = 'El formato del archivo no es válido.';

    /**
     * @return list<mixed>
     */
    public static function forKind(?AttachmentKind $kind): array
    {
        $maxKilobytes = $kind === null
            ? max(ReceiptMime::maxKilobytes(AttachmentKind::Audio), ReceiptMime::maxKilobytes(AttachmentKind::Image))
            : ReceiptMime::maxKilobytes($kind);

        return [
            'required',
            'file',
            'max:'.$maxKilobytes,
            function (string $attribute, mixed $value, Closure $fail) use ($kind): void {
                if (! $value instanceof UploadedFile) {
                    return;
                }

                $resolved = self::resolve($value, $kind);

                if ($resolved === null) {
                    $fail(self::INVALID_FORMAT);

                    return;
                }

                if ($kind === null && (int) $value->getSize() > ReceiptMime::maxKilobytes($resolved[0]) * 1024) {
                    $fail('El archivo es demasiado grande.');
                }
            },
        ];
    }

    /**
     * @return array{AttachmentKind, string}|null
     */
    public static function resolve(UploadedFile $file, ?AttachmentKind $kind): ?array
    {
        $mimes = ReceiptMime::fromConfig();
        $detected = $file->getMimeType();
        $client = $file->getClientMimeType();

        if ($kind === null) {
            return $mimes->detect($detected, $client);
        }

        $mime = $mimes->resolve($kind, $detected, $client);

        return $mime === null ? null : [$kind, $mime];
    }
}

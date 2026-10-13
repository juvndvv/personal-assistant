<?php

declare(strict_types=1);

namespace App\Enums;

enum CaptureKind: string
{
    case Voice = 'voice';
    case Photo = 'photo';

    public function attachmentKind(): AttachmentKind
    {
        return match ($this) {
            self::Voice => AttachmentKind::Audio,
            self::Photo => AttachmentKind::Image,
        };
    }

    public function draftOrigin(): DraftOrigin
    {
        return match ($this) {
            self::Voice => DraftOrigin::Voice,
            self::Photo => DraftOrigin::Photo,
        };
    }
}

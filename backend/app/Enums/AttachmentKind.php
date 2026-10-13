<?php

declare(strict_types=1);

namespace App\Enums;

enum AttachmentKind: string
{
    case Audio = 'audio';
    case Image = 'image';
}

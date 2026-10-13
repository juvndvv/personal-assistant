<?php

declare(strict_types=1);

namespace App\Enums;

enum DraftOrigin: string
{
    case Voice = 'voice';
    case Photo = 'photo';
    case Recurring = 'recurring';

    public function transactionOrigin(): TransactionOrigin
    {
        return match ($this) {
            self::Voice => TransactionOrigin::Voice,
            self::Photo => TransactionOrigin::Photo,
            self::Recurring => TransactionOrigin::Recurring,
        };
    }
}

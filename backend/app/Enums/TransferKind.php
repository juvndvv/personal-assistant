<?php

declare(strict_types=1);

namespace App\Enums;

enum TransferKind: string
{
    case Transfer = 'transfer';
    case CardSettlement = 'card_settlement';
}

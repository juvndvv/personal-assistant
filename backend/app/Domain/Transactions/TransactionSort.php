<?php

declare(strict_types=1);

namespace App\Domain\Transactions;

enum TransactionSort: string
{
    case DateDesc = '-date';
    case DateAsc = 'date';
    case AmountDesc = '-amount';
    case AmountAsc = 'amount';
}

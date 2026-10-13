<?php

declare(strict_types=1);

namespace App\Enums;

enum DraftType: string
{
    case Expense = 'expense';
    case Income = 'income';
    case Transfer = 'transfer';
}

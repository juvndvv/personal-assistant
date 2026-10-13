<?php

declare(strict_types=1);

namespace App\Enums;

enum CategoryKind: string
{
    case Expense = 'expense';
    case Income = 'income';
}

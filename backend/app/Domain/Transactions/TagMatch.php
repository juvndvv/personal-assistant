<?php

declare(strict_types=1);

namespace App\Domain\Transactions;

enum TagMatch: string
{
    case Any = 'any';
    case All = 'all';
}

<?php

declare(strict_types=1);

namespace App\Enums;

enum AccountType: string
{
    case Checking = 'checking';
    case Cash = 'cash';
    case CreditCard = 'credit_card';
    case SavingsInvestment = 'savings_investment';
}

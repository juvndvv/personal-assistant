<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Ledger\LedgerVerifier;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'app:ledger:verify')]
final class VerifyLedger extends Command
{
    protected $signature = 'app:ledger:verify';

    protected $description = 'Check the ledger invariants on the stored data';

    public function handle(LedgerVerifier $verifier): int
    {
        $violations = $verifier->violations();

        if ($violations === []) {
            $this->info('Ledger OK: no invariant violations found.');

            return self::SUCCESS;
        }

        foreach ($violations as $violation) {
            $this->error($violation);
        }

        $this->error(sprintf('%d ledger invariant violation(s) found.', count($violations)));

        return self::FAILURE;
    }
}

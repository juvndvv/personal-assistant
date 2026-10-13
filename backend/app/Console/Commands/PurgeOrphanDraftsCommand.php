<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Drafts\PurgeOrphanDrafts;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'app:drafts:purge')]
final class PurgeOrphanDraftsCommand extends Command
{
    protected $signature = 'app:drafts:purge';

    protected $description = 'Discard pending capture drafts older than the orphan TTL and delete their files';

    public function handle(PurgeOrphanDrafts $purgeOrphanDrafts): int
    {
        $purged = $purgeOrphanDrafts->handle();

        $this->info(sprintf('Purged %d orphan capture(s).', $purged));

        return self::SUCCESS;
    }
}

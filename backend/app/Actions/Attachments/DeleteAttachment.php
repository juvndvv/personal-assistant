<?php

declare(strict_types=1);

namespace App\Actions\Attachments;

use App\Exceptions\DomainConflict;
use App\Models\Attachment;
use Illuminate\Support\Facades\DB;

final class DeleteAttachment
{
    public function handle(Attachment $attachment): void
    {
        $deleted = DB::transaction(function () use ($attachment): Attachment {
            $locked = Attachment::query()->lockForUpdate()->findOrFail($attachment->id);

            if ($locked->transaction_id === null) {
                throw new DomainConflict(
                    'attachment_not_deletable',
                    'El archivo pertenece a un borrador pendiente. Descarta el borrador en su lugar.',
                );
            }

            $locked->delete();

            return $locked;
        });

        StoreReceiptFile::deleteFile($deleted);
    }
}

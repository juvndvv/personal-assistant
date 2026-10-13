<?php

declare(strict_types=1);

namespace App\Actions\Tags;

use App\Models\Tag;
use Illuminate\Support\Facades\DB;

final class DeleteTag
{
    public function handle(Tag $tag): void
    {
        DB::transaction(function () use ($tag): void {
            $tag->transactions()->detach();
            $tag->delete();
        });
    }
}

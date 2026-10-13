<?php

declare(strict_types=1);

namespace App\Actions\Tags;

use App\Domain\Tags\TagName;
use App\Models\Tag;

final class CreateTag
{
    public function handle(string $name): Tag
    {
        $normalized = TagName::normalize($name);

        return Tag::query()->whereRaw('lower(name) = ?', [$normalized])->first()
            ?? Tag::query()->createOrFirst(['name' => $normalized]);
    }
}

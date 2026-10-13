<?php

declare(strict_types=1);

namespace App\Actions\Tags;

use App\Domain\Tags\TagName;
use App\Exceptions\DomainConflict;
use App\Models\Tag;
use Illuminate\Support\Facades\DB;

final class RenameTag
{
    public function handle(Tag $tag, string $name): Tag
    {
        return DB::transaction(function () use ($tag, $name): Tag {
            $normalized = TagName::normalize($name);

            $taken = Tag::query()
                ->whereRaw('lower(name) = ?', [$normalized])
                ->whereKeyNot($tag->id)
                ->exists();

            if ($taken) {
                throw new DomainConflict('tag_name_taken', 'Ya existe una etiqueta con ese nombre.');
            }

            $tag->name = $normalized;
            $tag->save();

            return $tag;
        });
    }
}

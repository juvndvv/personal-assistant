<?php

declare(strict_types=1);

namespace App\Actions\Tags;

use App\Domain\Tags\TagName;
use App\Models\Tag;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

final class FindOrCreateTags
{
    /**
     * @param  iterable<mixed>  $names
     * @return Collection<int, Tag>
     */
    public function handle(iterable $names): Collection
    {
        $normalized = TagName::normalizeAll($names);

        if ($normalized === []) {
            return new Collection;
        }

        $now = CarbonImmutable::now();

        DB::table('tags')->insertOrIgnore(array_map(
            fn (string $name): array => ['name' => $name, 'created_at' => $now, 'updated_at' => $now],
            $normalized,
        ));

        return Tag::query()
            ->whereIn(DB::raw('lower(name)'), $normalized)
            ->orderBy('name')
            ->get();
    }
}

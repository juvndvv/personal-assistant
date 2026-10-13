<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\Tag;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;
use Tests\Support\RawLedger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    $this->account = Account::factory()->openedOn(day('2026-01-01'))->create();
    $this->category = Category::factory()->create();
});

it('lists tags by usage with live movements only, limited to 50', function (): void {
    $rome = Tag::query()->create(['name' => 'viaje roma']);
    $home = Tag::query()->create(['name' => 'casa']);
    $unused = Tag::query()->create(['name' => 'ahorro']);

    foreach (range(1, 3) as $index) {
        Ledger::expense($this->account, 100, '2026-10-01', $this->category)->tags()->attach($home);
    }

    Ledger::expense($this->account, 100, '2026-10-01', $this->category)->tags()->attach($rome);
    $deleted = Ledger::expense($this->account, 100, '2026-10-01', $this->category);
    $deleted->tags()->attach($rome);
    $deleted->tags()->attach($unused);
    $deleted->delete();

    $this->getJson('/api/v1/tags')
        ->assertOk()
        ->assertExactJson(['data' => [
            ['id' => $home->id, 'name' => 'casa', 'usage_count' => 3],
            ['id' => $rome->id, 'name' => 'viaje roma', 'usage_count' => 1],
            ['id' => $unused->id, 'name' => 'ahorro', 'usage_count' => 0],
        ]]);

    foreach (range(1, 60) as $index) {
        Tag::query()->create(['name' => "tag {$index}"]);
    }

    $this->getJson('/api/v1/tags')->assertOk()->assertJsonCount(50, 'data');
});

it('searches tags accent- and case-insensitively', function (): void {
    Tag::query()->create(['name' => 'viaje roma']);
    Tag::query()->create(['name' => 'café']);
    Tag::query()->create(['name' => 'casa']);

    $this->getJson('/api/v1/tags?q=ROM')->assertOk()->assertJsonPath('data.*.name', ['viaje roma']);
    $this->getJson('/api/v1/tags?q=cafe')->assertOk()->assertJsonPath('data.*.name', ['café']);
    $this->getJson('/api/v1/tags?q=%25')->assertOk()->assertJsonCount(0, 'data');
});

it('creates a tag trimmed and lower-cased, returning the existing one on the same name', function (): void {
    $created = $this->postJson('/api/v1/tags', ['name' => '  Viaje   ROMA '])
        ->assertCreated()
        ->assertJsonPath('data.name', 'viaje roma');

    $this->postJson('/api/v1/tags', ['name' => 'VIAJE ROMA'])
        ->assertOk()
        ->assertExactJson(['data' => ['id' => $created->json('data.id'), 'name' => 'viaje roma']]);

    expect(Tag::query()->count())->toBe(1);
});

it('validates tag names', function (mixed $name): void {
    $this->postJson('/api/v1/tags', ['name' => $name])->assertUnprocessable()->assertJsonValidationErrors(['name']);
})->with([null, '   ', 42, str_repeat('a', 41)]);

it('renames a tag and rejects case-insensitive collisions', function (): void {
    $home = Tag::query()->create(['name' => 'casa']);
    $trip = Tag::query()->create(['name' => 'viaje']);

    $this->patchJson("/api/v1/tags/{$trip->id}", ['name' => 'Viaje Roma'])
        ->assertOk()
        ->assertExactJson(['data' => ['id' => $trip->id, 'name' => 'viaje roma']]);

    $this->patchJson("/api/v1/tags/{$trip->id}", ['name' => 'CASA'])
        ->assertConflict()
        ->assertExactJson(['message' => 'Ya existe una etiqueta con ese nombre.', 'code' => 'tag_name_taken']);

    $this->patchJson("/api/v1/tags/{$home->id}", ['name' => 'Casa'])->assertOk()->assertJsonPath('data.name', 'casa');
    $this->patchJson('/api/v1/tags/999999', ['name' => 'x'])->assertNotFound();
});

it('deletes a tag and detaches it from movements', function (): void {
    $tag = Tag::query()->create(['name' => 'casa']);
    $transaction = Ledger::expense($this->account, 100, '2026-10-01', $this->category);
    $transaction->tags()->attach($tag);

    $this->deleteJson("/api/v1/tags/{$tag->id}")->assertNoContent();

    expect(Tag::query()->count())->toBe(0)
        ->and($transaction->tags()->count())->toBe(0)
        ->and($transaction->fresh())->not->toBeNull();

    $this->deleteJson("/api/v1/tags/{$tag->id}")->assertNotFound();
});

it('keeps tag names unique ignoring case in the database', function (): void {
    Tag::query()->create(['name' => 'casa']);

    RawLedger::expectRejected(fn () => DB::table('tags')->insert(['name' => 'CASA']), 'tags_name_unique');
});

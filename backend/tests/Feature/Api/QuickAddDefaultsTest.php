<?php

declare(strict_types=1);

use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Tests\Support\Ledger;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    $this->actingAs(User::factory()->create());
    $this->account = Account::factory()->openedOn(day('2026-01-01'))->create();
});

it('returns today, the default account and empty frequent lists without data', function (): void {
    Category::query()->delete();

    $this->getJson('/api/v1/quick-add/defaults')
        ->assertOk()
        ->assertExactJson(['data' => [
            'date' => '2026-10-13',
            'account_id' => $this->account->id,
            'frequent_category_ids' => ['expense' => [], 'income' => []],
        ]]);
});

it('returns a null account when no account is writable', function (): void {
    $this->account->update(['archived_at' => now()]);

    $this->getJson('/api/v1/quick-add/defaults')->assertOk()->assertJsonPath('data.account_id', null);
});

it('prefers the last used writable account over the default account', function (): void {
    $default = Account::factory()->openedOn(day('2026-01-01'))->create();
    $lastUsed = Account::factory()->openedOn(day('2026-01-01'))->create();
    Setting::current()->update(['default_account_id' => $default->id, 'last_used_account_id' => $lastUsed->id]);

    $this->getJson('/api/v1/quick-add/defaults')->assertJsonPath('data.account_id', $lastUsed->id);

    $lastUsed->update(['archived_at' => now()]);

    $this->getJson('/api/v1/quick-add/defaults')->assertJsonPath('data.account_id', $default->id);
});

it('ranks frequent categories by count in the last 90 days, ties by most recent use, padded by sort order', function (): void {
    $categories = collect(range(1, 12))->mapWithKeys(fn (int $index): array => [
        $index => Category::factory()->create(['name' => "C{$index}", 'sort_order' => $index]),
    ]);

    foreach ([1 => 3, 2 => 1, 3 => 2, 4 => 1, 5 => 1] as $index => $uses) {
        foreach (range(1, $uses) as $use) {
            Ledger::expense($this->account, 100, '2026-09-'.str_pad((string) (10 + $index), 2, '0', STR_PAD_LEFT), $categories[$index]);
        }
    }

    Ledger::expense($this->account, 100, '2026-07-14', $categories[12]);
    Ledger::expense($this->account, 100, '2026-07-14', $categories[12]);
    Ledger::expense($this->account, 100, '2026-07-14', $categories[12])->delete();
    Ledger::expense($this->account, 100, '2026-10-01', $categories[11])->delete();

    $salary = Category::factory()->income()->create(['sort_order' => 1]);
    $bonus = Category::factory()->income()->create(['sort_order' => 0]);
    Ledger::income($this->account, 100, '2026-10-01', $salary);

    $this->getJson('/api/v1/quick-add/defaults')
        ->assertOk()
        ->assertJsonPath('data.frequent_category_ids.expense', [
            $categories[1]->id,
            $categories[3]->id,
            $categories[5]->id,
            $categories[4]->id,
            $categories[2]->id,
            $categories[6]->id,
            $categories[7]->id,
            $categories[8]->id,
        ])
        ->assertJsonPath('data.frequent_category_ids.income', [$salary->id, $bonus->id]);
});

it('pads with non-archived leaf categories in tree order and skips archived ones', function (): void {
    Category::query()->delete();
    $food = Category::factory()->create(['name' => 'Alimentación', 'sort_order' => 0]);
    $fruit = Category::factory()->childOf($food)->create(['name' => 'Fruta', 'sort_order' => 1]);
    $market = Category::factory()->childOf($food)->create(['name' => 'Mercado', 'sort_order' => 0]);
    Category::factory()->childOf($food)->archived()->create();
    $archivedParent = Category::factory()->archived()->create(['sort_order' => 1]);
    Category::factory()->childOf($archivedParent)->create();
    $leisure = Category::factory()->create(['name' => 'Ocio', 'sort_order' => 2]);
    $used = Category::factory()->archived()->create();
    Ledger::expense($this->account, 100, '2026-10-01', $used);

    $this->getJson('/api/v1/quick-add/defaults')
        ->assertOk()
        ->assertJsonPath('data.frequent_category_ids.expense', [$market->id, $fruit->id, $leisure->id]);
});

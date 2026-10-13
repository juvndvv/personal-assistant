<?php

declare(strict_types=1);

use App\Enums\AccountType;
use App\Enums\CategoryKind;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Category;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\Transfer;
use Carbon\CarbonImmutable;
use Database\Seeders\DefaultCategoriesSeeder;
use Database\Seeders\DevSeeder;

it('seeds the default Spanish category tree', function (): void {
    $this->seed(DefaultCategoriesSeeder::class);

    $expense = Category::query()->where('kind', CategoryKind::Expense)->whereNull('parent_id')->ordered()->pluck('name')->all();
    $income = Category::query()->where('kind', CategoryKind::Income)->whereNull('parent_id')->ordered()->pluck('name')->all();
    $housing = Category::query()->where('name', 'Vivienda')->sole();

    expect($expense)->toBe([
        'Vivienda', 'Alimentación', 'Transporte', 'Salud', 'Ocio', 'Compras', 'Suscripciones',
        'Educación', 'Viajes', 'Regalos', 'Impuestos y tasas', 'Otros',
    ])
        ->and($income)->toBe(['Nómina', 'Freelance', 'Intereses', 'Reembolsos', 'Otros ingresos'])
        ->and($housing->children()->ordered()->pluck('name')->all())->toBe(['Alquiler/Hipoteca', 'Electricidad', 'Agua', 'Gas', 'Internet'])
        ->and(Category::query()->count())->toBe(29);
});

it('is idempotent and keeps user renames and additions', function (): void {
    $this->seed(DefaultCategoriesSeeder::class);
    Category::query()->where('name', 'Ocio')->update(['icon' => 'confetti']);
    Category::factory()->create(['name' => 'Mascotas']);

    $this->seed(DefaultCategoriesSeeder::class);

    expect(Category::query()->count())->toBe(30)
        ->and(Category::query()->where('name', 'Ocio')->value('icon'))->toBe('confetti');
});

it('seeds dev accounts of all four types with movements of every kind', function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));

    $this->seed(DevSeeder::class);
    $this->seed(DevSeeder::class);

    expect(Account::query()->pluck('type')->map(fn (AccountType $type): string => $type->value)->sort()->values()->all())
        ->toBe(['cash', 'checking', 'credit_card', 'savings_investment'])
        ->and(Transaction::query()->where('type', TransactionType::Expense)->exists())->toBeTrue()
        ->and(Transaction::query()->where('type', TransactionType::Income)->exists())->toBeTrue()
        ->and(Transaction::query()->where('type', TransactionType::Adjustment)->count())->toBe(1)
        ->and(Transfer::query()->count())->toBe(2)
        ->and(Setting::current()->default_account_id)->not->toBeNull();
});

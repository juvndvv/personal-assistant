<?php

declare(strict_types=1);

use App\Actions\Accounts\ArchiveAccount;
use App\Actions\Accounts\CreateAccount;
use App\Actions\Accounts\DeleteAccount;
use App\Actions\Accounts\UnarchiveAccount;
use App\Actions\Accounts\UpdateAccount;
use App\Enums\AccountType;
use App\Exceptions\DomainConflict;
use App\Models\Account;
use App\Models\Setting;
use App\Models\Transaction;
use Illuminate\Validation\ValidationException;

it('creates an account of every type', function (AccountType $type): void {
    $account = app(CreateAccount::class)->handle([
        'name' => 'Cuenta '.$type->value,
        'type' => $type,
        'opening_balance_cents' => -500,
        'opening_date' => '2026-01-01',
    ]);

    expect($account->exists)->toBeTrue()
        ->and($account->type)->toBe($type)
        ->and($account->opening_balance_cents)->toBe(-500);
})->with(AccountType::cases());

it('drops card-only fields on non-card accounts', function (): void {
    $account = app(CreateAccount::class)->handle([
        'name' => 'Caja', 'type' => AccountType::Cash, 'opening_date' => '2026-01-01', 'statement_day' => 5,
    ]);

    expect($account->statement_day)->toBeNull();
});

it('locks the type once the account has movements', function (): void {
    $account = Account::factory()->create();
    Transaction::factory()->on($account)->expense(100)->create();

    app(UpdateAccount::class)->handle($account, ['type' => AccountType::Cash]);
})->throws(ValidationException::class);

it('allows changing the type while the account has no movements', function (): void {
    $account = Account::factory()->creditCard(statementDay: 5)->create();

    $updated = app(UpdateAccount::class)->handle($account, ['type' => AccountType::Checking]);

    expect($updated->type)->toBe(AccountType::Checking)
        ->and($updated->statement_day)->toBeNull();
});

it('clears settlement pointers when the settlement account becomes a card', function (): void {
    $checking = Account::factory()->create();
    $card = Account::factory()->creditCard(settlementAccountId: $checking->id)->create();

    app(UpdateAccount::class)->handle($checking, ['type' => AccountType::CreditCard]);

    expect($card->refresh()->settlement_account_id)->toBeNull();
});

it('rejects moving the opening date after existing movements', function (bool $softDeleted): void {
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    $movement = Transaction::factory()->on($account, day('2026-02-01'))->expense(100)->create();

    if ($softDeleted) {
        $movement->delete();
    }

    expect(fn () => app(UpdateAccount::class)->handle($account, ['opening_date' => '2026-02-02']))
        ->toThrow(fn (DomainConflict $conflict) => expect($conflict->errorCode)->toBe('opening_date_after_movements'));
})->with(['live movement' => false, 'soft-deleted movement' => true]);

it('allows moving the opening date up to the first movement', function (): void {
    $account = Account::factory()->openedOn(day('2026-01-01'))->create();
    Transaction::factory()->on($account, day('2026-02-01'))->expense(100)->create();

    $updated = app(UpdateAccount::class)->handle($account, ['opening_date' => '2026-02-01']);

    expect($updated->opening_date->toDateString())->toBe('2026-02-01');
});

it('archives an account and clears the settings pointers to it', function (): void {
    $account = Account::factory()->create();
    $other = Account::factory()->create();
    Setting::current()->update(['default_account_id' => $account->id, 'last_used_account_id' => $account->id]);

    $archived = app(ArchiveAccount::class)->handle($account);

    expect($archived->isArchived())->toBeTrue()
        ->and(Setting::current()->default_account_id)->toBeNull()
        ->and(Setting::current()->last_used_account_id)->toBeNull();

    Setting::current()->update(['default_account_id' => $other->id]);
    app(ArchiveAccount::class)->handle($account);

    expect(Setting::current()->default_account_id)->toBe($other->id);
});

it('unarchives an account', function (): void {
    $account = Account::factory()->archived()->create();

    expect(app(UnarchiveAccount::class)->handle($account)->isArchived())->toBeFalse();
});

it('refuses to delete an account with live movements', function (): void {
    $account = Account::factory()->create();
    Transaction::factory()->on($account)->expense(100)->create();

    expect(fn () => app(DeleteAccount::class)->handle($account))
        ->toThrow(fn (DomainConflict $conflict) => expect($conflict->errorCode)->toBe('account_has_movements'));

    expect(Account::query()->whereKey($account->id)->exists())->toBeTrue();
});

it('soft deletes an account without live movements and clears references', function (): void {
    $account = Account::factory()->create();
    $card = Account::factory()->creditCard(settlementAccountId: $account->id)->create();
    Transaction::factory()->on($account)->expense(100)->create()->delete();
    Setting::current()->update(['default_account_id' => $account->id]);

    app(DeleteAccount::class)->handle($account);

    expect(Account::query()->whereKey($account->id)->exists())->toBeFalse()
        ->and(Account::withTrashed()->whereKey($account->id)->exists())->toBeTrue()
        ->and(Setting::current()->default_account_id)->toBeNull()
        ->and($card->refresh()->settlement_account_id)->toBeNull();
});

<?php

declare(strict_types=1);

namespace App\Actions\Transactions;

use App\Actions\Ledger\UpdateBalanceAdjustment;
use App\Actions\Suggestions\LearnCategorization;
use App\Actions\Tags\SyncTransactionTags;
use App\Domain\Ledger\MovementRules;
use App\Domain\Transactions\Changes;
use App\Enums\CategoryKind;
use App\Enums\TransactionType;
use App\Models\Account;
use App\Models\Transaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final readonly class UpdateTransaction
{
    public function __construct(
        private EnsureNotTransferLeg $ensureNotTransferLeg,
        private UpdateBalanceAdjustment $updateBalanceAdjustment,
        private MovementRules $rules,
        private SyncTransactionTags $syncTags,
        private LearnCategorization $learnCategorization,
    ) {}

    public function handle(Transaction $transaction, Changes $changes): Transaction
    {
        $this->ensureNotTransferLeg->handle($transaction);

        if ($transaction->type === TransactionType::Adjustment) {
            return $this->updateBalanceAdjustment->handle($transaction, $changes);
        }

        return DB::transaction(function () use ($transaction, $changes): Transaction {
            $transaction = Transaction::query()->lockForUpdate()->findOrFail($transaction->id);
            $type = $this->resolveType($transaction, $changes);
            $magnitude = $changes->integer('amount_cents') ?? $transaction->magnitudeCents();

            $account = $this->resolveAccount($transaction, $changes);
            $date = $changes->date('date') ?? $transaction->date;

            if ($changes->has('date') || $changes->has('account_id')) {
                $this->rules->ensureDateAllowed($account, $date);
            }

            $transaction->type = $type;
            $transaction->amount_cents = $type === TransactionType::Expense ? -$magnitude : $magnitude;
            $transaction->account_id = $account->id;
            $transaction->date = $date;
            $transaction->category_id = $this->resolveCategoryId($transaction, $type, $changes);

            foreach (['description', 'merchant', 'note'] as $field) {
                if ($changes->has($field)) {
                    $transaction->setAttribute($field, $changes->text($field));
                }
            }

            $changesCategorization = $transaction->isDirty(['type', 'category_id', 'account_id', 'merchant', 'description']);
            $transaction->save();

            if ($changesCategorization) {
                $this->learnCategorization->handle($transaction);
            }

            if ($changes->has('tags')) {
                $this->syncTags->handle($transaction, $changes->strings('tags'));
            }

            return $transaction;
        });
    }

    private function resolveType(Transaction $transaction, Changes $changes): TransactionType
    {
        $requested = $changes->has('type') ? TransactionType::tryFrom((string) $changes->text('type')) : null;

        return in_array($requested, [TransactionType::Expense, TransactionType::Income], true)
            ? $requested
            : $transaction->type;
    }

    private function resolveAccount(Transaction $transaction, Changes $changes): Account
    {
        $accountId = $changes->integer('account_id');

        if ($accountId === null || $accountId === $transaction->account_id) {
            return Account::query()->withTrashed()->findOrFail($transaction->account_id);
        }

        return $this->rules->writableAccount($accountId);
    }

    private function resolveCategoryId(Transaction $transaction, TransactionType $type, Changes $changes): int
    {
        $kind = $type === TransactionType::Expense ? CategoryKind::Expense : CategoryKind::Income;
        $categoryId = $changes->integer('category_id');

        if ($categoryId !== null && $categoryId !== $transaction->getOriginal('category_id')) {
            return $this->rules->usableCategory($categoryId, $kind)->id;
        }

        $currentCategoryId = $categoryId ?? $transaction->category_id;
        $currentKind = $currentCategoryId === null
            ? null
            : DB::table('categories')->where('id', $currentCategoryId)->value('kind');

        if ($currentCategoryId === null || $currentKind !== $kind->value) {
            throw ValidationException::withMessages([
                'category_id' => 'Elige una categoría del mismo tipo que el movimiento.',
            ]);
        }

        return $currentCategoryId;
    }
}

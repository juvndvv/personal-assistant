<?php

declare(strict_types=1);

namespace App\Actions\Transactions;

use App\Actions\Drafts\ConfirmDraft;
use App\Actions\QuickAdd\QuickAddDefaults;
use App\Actions\Suggestions\LearnCategorization;
use App\Actions\Tags\SyncTransactionTags;
use App\Domain\Ledger\MovementRules;
use App\Enums\CategoryKind;
use App\Enums\TransactionOrigin;
use App\Enums\TransactionType;
use App\Models\Setting;
use App\Models\Transaction;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

final readonly class RegisterTransaction
{
    public function __construct(
        private MovementRules $rules,
        private QuickAddDefaults $quickAddDefaults,
        private SyncTransactionTags $syncTags,
        private ConfirmDraft $confirmDraft,
        private LearnCategorization $learnCategorization,
    ) {}

    /**
     * @param  list<string>  $tags
     * @param  (Closure(Transaction): void)|null  $withinTransaction
     */
    public function handle(
        TransactionType $type,
        int $amountCents,
        int $categoryId,
        ?CarbonImmutable $date = null,
        ?int $accountId = null,
        ?string $description = null,
        ?string $merchant = null,
        ?string $note = null,
        array $tags = [],
        TransactionOrigin $origin = TransactionOrigin::Manual,
        ?Closure $withinTransaction = null,
        ?int $draftId = null,
    ): Transaction {
        $kind = self::categoryKindFor($type);

        if ($amountCents < 1 || $amountCents > MovementRules::MAX_MAGNITUDE_CENTS) {
            throw ValidationException::withMessages(['amount_cents' => 'El importe no es válido.']);
        }

        return DB::transaction(function () use ($type, $kind, $amountCents, $categoryId, $date, $accountId, $description, $merchant, $note, $tags, $origin, $withinTransaction, $draftId): Transaction {
            $draft = $draftId === null ? null : $this->confirmDraft->lockPending($draftId);
            $origin = $draft?->origin->transactionOrigin() ?? $origin;

            $accountId ??= $this->quickAddDefaults->defaultAccountId()
                ?? throw ValidationException::withMessages(['account_id' => 'Crea una cuenta antes de registrar movimientos.']);

            $account = $this->rules->writableAccount($accountId);
            $date = ($date ?? CarbonImmutable::today())->startOfDay();
            $this->rules->ensureDateAllowed($account, $date);
            $category = $this->rules->usableCategory($categoryId, $kind);

            $transaction = new Transaction;
            $transaction->type = $type;
            $transaction->account_id = $account->id;
            $transaction->amount_cents = $type === TransactionType::Expense ? -$amountCents : $amountCents;
            $transaction->date = $date;
            $transaction->category_id = $category->id;
            $transaction->description = $description;
            $transaction->merchant = $merchant;
            $transaction->note = $note;
            $transaction->origin = $origin;
            $transaction->save();

            $this->syncTags->handle($transaction, $tags);

            if ($origin !== TransactionOrigin::Recurring) {
                $this->learnCategorization->handle($transaction);
            }

            Setting::query()->whereKey(Setting::SINGLETON_ID)->update([
                'last_used_account_id' => $account->id,
                'updated_at' => CarbonImmutable::now(),
            ]);

            if ($draft !== null) {
                $this->confirmDraft->handle($draft, transaction: $transaction);
            }

            if ($withinTransaction !== null) {
                $withinTransaction($transaction);
            }

            $transaction->setRelation('account', $account);
            $transaction->setRelation('category', $category);
            $transaction->setRelation('transfer', null);

            return $transaction;
        });
    }

    private static function categoryKindFor(TransactionType $type): CategoryKind
    {
        return match ($type) {
            TransactionType::Expense => CategoryKind::Expense,
            TransactionType::Income => CategoryKind::Income,
            default => throw new InvalidArgumentException("Transactions of type {$type->value} are not registered here."),
        };
    }
}

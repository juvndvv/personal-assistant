<?php

declare(strict_types=1);

namespace App\Actions\Tags;

use App\Enums\TransactionType;
use App\Models\Transaction;
use Illuminate\Validation\ValidationException;

final readonly class SyncTransactionTags
{
    public function __construct(private FindOrCreateTags $findOrCreateTags) {}

    /**
     * @param  iterable<mixed>  $names
     */
    public function handle(Transaction $transaction, iterable $names): void
    {
        $tags = $this->findOrCreateTags->handle($names);

        if ($tags->isNotEmpty() && ! in_array($transaction->type, [TransactionType::Expense, TransactionType::Income], true)) {
            throw ValidationException::withMessages([
                'tags' => 'Solo los gastos y los ingresos admiten etiquetas.',
            ]);
        }

        $transaction->tags()->sync($tags->modelKeys());
        $transaction->setRelation('tags', $tags);
    }
}

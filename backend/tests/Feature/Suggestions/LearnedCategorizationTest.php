<?php

declare(strict_types=1);

use App\Ai\Agents\TransactionExtractor;
use App\Models\Account;
use App\Models\CategorizationHint;
use App\Models\Category;
use App\Models\Draft;
use App\Models\RecurringTemplate;
use App\Models\Transaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Ai\Prompts\AgentPrompt;
use Laravel\Ai\Transcription;
use Tests\Support\Captures;

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-10-13 10:00', 'Europe/Madrid'));
    Storage::fake('receipts');
    $this->actingAs(User::factory()->create());

    $this->checking = Account::factory()->openedOn(day('2026-01-01'))->create(['name' => 'BBVA']);
    $this->visa = Account::factory()->creditCard(statementDay: 5)->openedOn(day('2026-01-01'))->create(['name' => 'Visa']);
    $this->leisure = Category::factory()->create(['name' => 'Ocio']);
    $this->food = Category::factory()->create(['name' => 'Alimentación']);
    $this->groceries = Category::factory()->childOf($this->food)->create(['name' => 'Supermercado']);
    $this->fuel = Category::factory()->create(['name' => 'Gasolina']);
    $this->salary = Category::factory()->income()->create(['name' => 'Nómina']);
});

function suggestionFor(array $query): TestResponse
{
    return test()->getJson('/api/v1/suggestions/categorization?'.http_build_query($query));
}

/**
 * @return list<array{instructions: string, prompt: string, attachments: int}>
 */
function promptsSentToExtractor(): array
{
    $sent = [];

    TransactionExtractor::assertNotPrompted(function (AgentPrompt $prompt) use (&$sent): bool {
        $sent[] = [
            'instructions' => (string) $prompt->agent->instructions(),
            'prompt' => $prompt->prompt,
            'attachments' => count($prompt->attachments),
        ];

        return false;
    });

    expect($sent)->toHaveCount(2);

    return $sent;
}

function storeExpense(array $attributes): TestResponse
{
    return test()->postJson('/api/v1/transactions', ['type' => 'expense', 'amount_cents' => 2_000, ...$attributes]);
}

it('learns from one corrected capture and applies it to the next capture and the manual form', function (): void {
    $wrongGuess = Captures::extraction(['category_id' => $this->leisure->id, 'account_id' => $this->checking->id]);
    $first = Captures::voiceDraft($wrongGuess);

    expect($first->category_id)->toBe($this->leisure->id);

    storeExpense([
        'draft_id' => $first->id,
        'category_id' => $this->groceries->id,
        'account_id' => $this->visa->id,
        'merchant' => 'Mercadona',
        'description' => 'Mercadona',
    ])->assertCreated();

    Captures::postVoice('Veinte euros en Mercadona con la Visa', $wrongGuess)
        ->assertCreated()
        ->assertJsonPath('data.draft.proposal.category_id', $this->groceries->id)
        ->assertJsonPath('data.draft.proposal.account_id', $this->visa->id)
        ->assertJsonPath('data.draft.field_sources.category_id', 'history')
        ->assertJsonPath('data.draft.field_sources.account_id', 'history')
        ->assertJsonPath('data.draft.field_sources.amount_cents', 'ai')
        ->assertJsonPath('data.draft.confidence.category_id', 0.95)
        ->assertJsonPath('data.draft.confidence.account_id', 0.95)
        ->assertJsonPath('data.draft.low_confidence_fields', []);

    [$beforeLearning, $afterLearning] = promptsSentToExtractor();

    expect($afterLearning)->toBe($beforeLearning);

    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadona'])
        ->assertOk()
        ->assertExactJson(['data' => [
            'category_id' => $this->groceries->id,
            'account_id' => $this->visa->id,
            'source' => 'history',
            'hits' => 1,
        ]]);
});

it('applies the hint to photo captures and clears the low-confidence flags it resolves', function (): void {
    storeExpense(['category_id' => $this->groceries->id, 'account_id' => $this->visa->id, 'merchant' => 'MERCADONA S.A.'])->assertCreated();

    Captures::postPhoto(Captures::extraction([
        'merchant' => 'Mercadona, S.A.',
        'category_id' => null,
        'account_id' => null,
        'confidence' => ['category_id' => 0.2, 'account_id' => 0.1],
    ]))
        ->assertCreated()
        ->assertJsonPath('data.draft.proposal.category_id', $this->groceries->id)
        ->assertJsonPath('data.draft.proposal.account_id', $this->visa->id)
        ->assertJsonPath('data.draft.field_sources.category_id', 'history')
        ->assertJsonPath('data.draft.low_confidence_fields', []);
});

it('keeps the AI account when the hint has no usable account', function (): void {
    storeExpense(['category_id' => $this->groceries->id, 'account_id' => $this->visa->id, 'merchant' => 'Mercadona'])->assertCreated();
    $this->visa->update(['archived_at' => CarbonImmutable::now()]);

    Captures::postVoice('Veinte euros en Mercadona', Captures::extraction(['category_id' => $this->leisure->id, 'account_id' => $this->checking->id]))
        ->assertCreated()
        ->assertJsonPath('data.draft.proposal.category_id', $this->groceries->id)
        ->assertJsonPath('data.draft.proposal.account_id', $this->checking->id)
        ->assertJsonPath('data.draft.field_sources.account_id', 'ai');

    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadona'])
        ->assertOk()
        ->assertJsonPath('data.account_id', null);
});

it('does not apply hints when the extraction failed', function (): void {
    storeExpense(['category_id' => $this->groceries->id, 'merchant' => 'Veinte euros en Mercadona'])->assertCreated();

    Transcription::fake(['Veinte euros en Mercadona'])->preventStrayTranscriptions();
    TransactionExtractor::fake(fn () => throw new RuntimeException('OpenAI returned 500'))->preventStrayPrompts();

    $this->post('/api/v1/captures', ['kind' => 'voice', 'file' => Captures::audio()])
        ->assertCreated()
        ->assertJsonPath('data.capture.status', 'failed')
        ->assertJsonPath('data.draft.proposal.category_id', null)
        ->assertJsonPath('data.draft.low_confidence_fields', ['amount_cents', 'category_id', 'description', 'merchant']);
});

it('does not apply expense hints to income or transfer captures', function (): void {
    storeExpense(['category_id' => $this->groceries->id, 'merchant' => 'Empresa'])->assertCreated();

    Captures::postVoice('Me pagan la nómina de Empresa', Captures::extraction([
        'type' => 'income', 'merchant' => 'Empresa', 'category_id' => $this->salary->id,
    ]))->assertCreated()
        ->assertJsonPath('data.draft.proposal.category_id', $this->salary->id)
        ->assertJsonPath('data.draft.field_sources.category_id', 'ai');

    Captures::postVoice('Paso cien a la Visa', Captures::extraction([
        'type' => 'transfer', 'merchant' => 'Empresa', 'account_id' => $this->checking->id, 'to_account_id' => $this->visa->id,
    ]))->assertCreated()
        ->assertJsonPath('data.draft.proposal.type', 'transfer')
        ->assertJsonPath('data.draft.proposal.category_id', null);
});

it('never applies hints to recurring drafts', function (): void {
    storeExpense(['category_id' => $this->leisure->id, 'account_id' => $this->visa->id, 'merchant' => 'Iberdrola'])->assertCreated();

    RecurringTemplate::factory()->variable()->create([
        'name' => 'Luz', 'merchant' => 'Iberdrola', 'account_id' => $this->checking->id,
        'category_id' => $this->fuel->id, 'day_of_month' => 13, 'starts_on' => day('2026-10-01'),
    ]);

    $this->artisan('app:recurring:generate')->assertSuccessful();

    $draft = Draft::query()->where('origin', 'recurring')->sole();

    expect($draft->category_id)->toBe($this->fuel->id)
        ->and($draft->account_id)->toBe($this->checking->id)
        ->and($draft->field_sources)->not->toContain('history');
});

it('learns from manual movements and edits, last write wins and hits add up', function (): void {
    $id = storeExpense(['category_id' => $this->leisure->id, 'account_id' => $this->checking->id, 'merchant' => 'Café Pepe, 12'])
        ->assertCreated()
        ->json('data.id');

    $this->patchJson("/api/v1/transactions/{$id}", ['category_id' => $this->food->id, 'account_id' => $this->visa->id])->assertOk();

    $hint = CategorizationHint::query()->sole();

    expect($hint->key)->toBe('cafe pepe')
        ->and($hint->kind->value)->toBe('expense')
        ->and($hint->category_id)->toBe($this->food->id)
        ->and($hint->account_id)->toBe($this->visa->id)
        ->and($hint->hits)->toBe(2);

    suggestionFor(['type' => 'expense', 'merchant' => 'CAFE PEPE'])
        ->assertOk()
        ->assertJsonPath('data.category_id', $this->food->id)
        ->assertJsonPath('data.hits', 2);
});

it('does not relearn when an edit leaves the categorization untouched', function (): void {
    $older = storeExpense(['category_id' => $this->leisure->id, 'account_id' => $this->checking->id, 'merchant' => 'Mercadona'])
        ->assertCreated()
        ->json('data.id');
    $newer = storeExpense(['category_id' => $this->leisure->id, 'account_id' => $this->checking->id, 'merchant' => 'Mercadona'])
        ->assertCreated()
        ->json('data.id');

    $this->patchJson("/api/v1/transactions/{$newer}", ['category_id' => $this->groceries->id, 'account_id' => $this->visa->id])->assertOk();
    $this->patchJson("/api/v1/transactions/{$older}", ['note' => 'Compra semanal', 'category_id' => $this->leisure->id])->assertOk();

    $hint = CategorizationHint::query()->sole();

    expect($hint->category_id)->toBe($this->groceries->id)
        ->and($hint->account_id)->toBe($this->visa->id)
        ->and($hint->hits)->toBe(3);
});

it('does not learn from confirmed variable recurring drafts', function (): void {
    storeExpense(['category_id' => $this->leisure->id, 'account_id' => $this->visa->id, 'merchant' => 'Iberdrola'])->assertCreated();
    $before = CategorizationHint::query()->sole()->only(['category_id', 'account_id', 'hits', 'last_used_at']);

    RecurringTemplate::factory()->variable()->create([
        'name' => 'Luz', 'merchant' => 'Iberdrola', 'account_id' => $this->checking->id,
        'category_id' => $this->fuel->id, 'day_of_month' => 13, 'starts_on' => day('2026-10-01'),
    ]);
    $this->artisan('app:recurring:generate')->assertSuccessful();
    $draft = Draft::query()->where('origin', 'recurring')->sole();

    storeExpense([
        'draft_id' => $draft->id, 'amount_cents' => 7_345, 'date' => '2026-10-13',
        'category_id' => $this->fuel->id, 'account_id' => $this->checking->id, 'merchant' => 'Iberdrola',
    ])->assertCreated()->assertJsonPath('data.origin', 'recurring');

    expect(CategorizationHint::query()->sole()->only(['category_id', 'account_id', 'hits', 'last_used_at']))->toEqual($before);
});

it('keys a movement by its description when it has no merchant', function (): void {
    storeExpense(['category_id' => $this->fuel->id, 'description' => 'Gasolina Repsol'])->assertCreated();

    expect(CategorizationHint::query()->sole()->key)->toBe('gasolina repsol');

    suggestionFor(['type' => 'expense', 'description' => 'gasolina repsol'])
        ->assertOk()
        ->assertJsonPath('data.category_id', $this->fuel->id);
});

it('prefers the merchant hint over the description hint', function (): void {
    storeExpense(['category_id' => $this->fuel->id, 'description' => 'Compra'])->assertCreated();
    storeExpense(['category_id' => $this->groceries->id, 'merchant' => 'Mercadona', 'description' => 'Compra'])->assertCreated();

    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadona', 'description' => 'Compra'])
        ->assertOk()
        ->assertJsonPath('data.category_id', $this->groceries->id);

    suggestionFor(['type' => 'expense', 'merchant' => 'Desconocido', 'description' => 'Compra'])
        ->assertOk()
        ->assertJsonPath('data.category_id', $this->fuel->id);
});

it('falls back to the closest trigram match above the threshold', function (): void {
    storeExpense(['category_id' => $this->groceries->id, 'merchant' => 'Mercadona'])->assertCreated();

    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadonas'])
        ->assertOk()
        ->assertJsonPath('data.category_id', $this->groceries->id);

    suggestionFor(['type' => 'expense', 'merchant' => 'Merca'])->assertNoContent();
    suggestionFor(['type' => 'expense', 'merchant' => 'Carrefour'])->assertNoContent();
});

it('returns 204 without a hint for the kind and ignores hints on archived categories', function (): void {
    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadona'])->assertNoContent();

    storeExpense(['category_id' => $this->groceries->id, 'merchant' => 'Mercadona'])->assertCreated();

    suggestionFor(['type' => 'income', 'merchant' => 'Mercadona'])->assertNoContent();
    suggestionFor(['type' => 'expense'])->assertNoContent();

    $this->food->update(['archived_at' => CarbonImmutable::now()]);
    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadona'])->assertNoContent();
});

it('ignores hints whose own category was archived while its parent stays active', function (): void {
    storeExpense(['category_id' => $this->groceries->id, 'account_id' => $this->visa->id, 'merchant' => 'Mercadona'])->assertCreated();

    $this->groceries->update(['archived_at' => CarbonImmutable::now()]);

    expect($this->food->fresh()->archived_at)->toBeNull();

    suggestionFor(['type' => 'expense', 'merchant' => 'Mercadona'])->assertNoContent();

    Captures::postVoice('Veinte euros en Mercadona', Captures::extraction(['category_id' => $this->leisure->id, 'account_id' => $this->checking->id]))
        ->assertCreated()
        ->assertJsonPath('data.draft.proposal.category_id', $this->leisure->id)
        ->assertJsonPath('data.draft.field_sources.category_id', 'ai');
});

it('does not learn from adjustments, transfers or movements without text', function (): void {
    storeExpense(['category_id' => $this->groceries->id])->assertCreated();
    storeExpense(['category_id' => $this->groceries->id, 'merchant' => '12, 34'])->assertCreated();
    $this->postJson('/api/v1/transfers', [
        'from_account_id' => $this->checking->id, 'to_account_id' => $this->visa->id, 'amount_cents' => 1_000, 'note' => 'Mercadona',
    ])->assertCreated();
    $this->postJson("/api/v1/accounts/{$this->checking->id}/adjustments", ['target_balance_cents' => 5_000, 'date' => '2026-10-13', 'note' => 'Mercadona'])
        ->assertCreated();

    expect(CategorizationHint::query()->count())->toBe(0)
        ->and(Transaction::query()->count())->toBeGreaterThan(3);
});

it('validates the suggestion query', function (array $query, string $field): void {
    suggestionFor($query)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'missing type' => [['merchant' => 'Mercadona'], 'type'],
    'transfer type' => [['type' => 'transfer', 'merchant' => 'Mercadona'], 'type'],
    'long merchant' => [['type' => 'expense', 'merchant' => str_repeat('a', 121)], 'merchant'],
    'long description' => [['type' => 'expense', 'description' => str_repeat('a', 256)], 'description'],
]);

it('requires authentication', function (): void {
    auth()->logout();
    $this->app['auth']->forgetGuards();

    $this->getJson('/api/v1/suggestions/categorization?type=expense&merchant=x')->assertUnauthorized();
});

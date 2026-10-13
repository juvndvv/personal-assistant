<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Ai\Agents\TransactionExtractor;
use App\Models\Draft;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Laravel\Ai\Transcription;
use Symfony\Component\HttpFoundation\Response;

final class Captures
{
    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function extraction(array $overrides = []): array
    {
        return array_replace_recursive([
            'type' => 'expense',
            'amount_cents' => 2000,
            'date' => '2026-10-13',
            'description' => 'Mercadona',
            'merchant' => 'Mercadona',
            'category_id' => null,
            'account_id' => null,
            'to_account_id' => null,
            'confidence' => [
                'type' => 0.95, 'amount_cents' => 0.98, 'date' => 0.9, 'description' => 0.9,
                'merchant' => 0.9, 'category_id' => 0.9, 'account_id' => 0.9, 'to_account_id' => 0.0,
            ],
        ], $overrides);
    }

    public static function audio(string $name = 'nota.m4a', string $mime = 'audio/mp4', int $kilobytes = 120): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kilobytes, $mime);
    }

    public static function photo(string $name = 'ticket.jpg', string $mime = 'image/jpeg', int $kilobytes = 300): UploadedFile
    {
        return UploadedFile::fake()->create($name, $kilobytes, $mime);
    }

    /**
     * @param  array<string, mixed>  $extraction
     * @return TestResponse<Response>
     */
    public static function postVoice(string $transcript, array $extraction, array $extra = []): TestResponse
    {
        Transcription::fake([$transcript])->preventStrayTranscriptions();
        TransactionExtractor::fake([$extraction])->preventStrayPrompts();

        return test()->post('/api/v1/captures', ['kind' => 'voice', 'file' => self::audio(), ...$extra]);
    }

    /**
     * @param  array<string, mixed>  $extraction
     * @return TestResponse<Response>
     */
    public static function postPhoto(array $extraction, array $extra = []): TestResponse
    {
        TransactionExtractor::fake([$extraction])->preventStrayPrompts();

        return test()->post('/api/v1/captures', ['kind' => 'photo', 'file' => self::photo(), ...$extra]);
    }

    /**
     * @param  array<string, mixed>  $extraction
     */
    public static function voiceDraft(array $extraction, string $transcript = 'Veinte euros en Mercadona con la Visa'): Draft
    {
        $id = self::postVoice($transcript, $extraction)->assertCreated()->json('data.draft.id');

        return Draft::query()->findOrFail(is_numeric($id) ? (int) $id : 0);
    }

    /**
     * @param  array<string, mixed>  $extraction
     */
    public static function photoDraft(array $extraction): Draft
    {
        $id = self::postPhoto($extraction)->assertCreated()->json('data.draft.id');

        return Draft::query()->findOrFail(is_numeric($id) ? (int) $id : 0);
    }
}

<?php

declare(strict_types=1);

namespace App\Domain\Attachments;

use App\Enums\AttachmentKind;

final readonly class ReceiptMime
{
    public const array EXTENSIONS = [
        'audio/mp4' => 'm4a',
        'audio/x-m4a' => 'm4a',
        'audio/aac' => 'aac',
        'audio/webm' => 'webm',
        'audio/ogg' => 'ogg',
        'audio/mpeg' => 'mp3',
        'audio/wav' => 'wav',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    private const array AUDIO_ALIASES = [
        'video/mp4' => 'audio/mp4',
        'audio/m4a' => 'audio/mp4',
        'video/webm' => 'audio/webm',
        'application/ogg' => 'audio/ogg',
        'audio/x-wav' => 'audio/wav',
        'audio/wave' => 'audio/wav',
        'audio/vnd.wave' => 'audio/wav',
        'audio/mp3' => 'audio/mpeg',
        'audio/x-hx-aac-adts' => 'audio/aac',
        'audio/x-aac' => 'audio/aac',
    ];

    private const string UNKNOWN_BINARY = 'application/octet-stream';

    /**
     * @param  list<string>  $audioMimes
     * @param  list<string>  $imageMimes
     */
    public function __construct(
        private array $audioMimes,
        private array $imageMimes,
    ) {}

    public static function fromConfig(): self
    {
        return new self(self::configList('finance.capture.audio_mimes'), self::configList('finance.capture.image_mimes'));
    }

    public function resolve(AttachmentKind $kind, ?string $detected, ?string $client): ?string
    {
        $detected = self::normalize($detected);
        $client = self::normalize($client);

        if ($kind === AttachmentKind::Image) {
            return $detected !== null && in_array($detected, $this->imageMimes, true) ? $detected : null;
        }

        $candidate = $detected === null || $detected === self::UNKNOWN_BINARY ? $client : $detected;

        if ($candidate === null) {
            return null;
        }

        if (in_array($candidate, $this->audioMimes, true)) {
            return $candidate;
        }

        $alias = self::AUDIO_ALIASES[$candidate] ?? null;

        return $alias !== null && in_array($alias, $this->audioMimes, true) ? $alias : null;
    }

    /**
     * @return array{AttachmentKind, string}|null
     */
    public function detect(?string $detected, ?string $client): ?array
    {
        foreach ([AttachmentKind::Image, AttachmentKind::Audio] as $kind) {
            $mime = $this->resolve($kind, $detected, $client);

            if ($mime !== null) {
                return [$kind, $mime];
            }
        }

        return null;
    }

    public static function extension(string $mime): string
    {
        return self::EXTENSIONS[$mime] ?? 'bin';
    }

    public static function maxKilobytes(AttachmentKind $kind): int
    {
        $value = config($kind === AttachmentKind::Audio ? 'finance.capture.max_audio_kb' : 'finance.capture.max_image_kb');

        return is_numeric($value) ? (int) $value : 8192;
    }

    private static function normalize(?string $mime): ?string
    {
        if ($mime === null) {
            return null;
        }

        $base = strtolower(trim(explode(';', $mime)[0]));

        return $base === '' ? null : $base;
    }

    /**
     * @return list<string>
     */
    private static function configList(string $key): array
    {
        $value = config($key);

        return is_array($value) ? array_values(array_filter($value, is_string(...))) : [];
    }
}

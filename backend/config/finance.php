<?php

declare(strict_types=1);

return [

    'capture' => [
        'audio_mimes' => [
            'audio/mp4',
            'audio/x-m4a',
            'audio/aac',
            'audio/webm',
            'audio/ogg',
            'audio/mpeg',
            'audio/wav',
        ],
        'image_mimes' => [
            'image/jpeg',
            'image/png',
            'image/webp',
        ],
        'max_audio_kb' => 10240,
        'max_image_kb' => 8192,
        'deadline_seconds' => (int) env('CAPTURE_DEADLINE_SECONDS', 15),
        'low_confidence_threshold' => 0.7,
        'rate_limit_per_hour' => 60,
    ],

    'security' => [
        'api_rate_limit_per_minute' => (int) env('API_RATE_LIMIT_PER_MINUTE', 120),
        'login_lockout' => [
            'cache_store' => env('LOGIN_LOCKOUT_CACHE_STORE', 'database'),
            'max_failures' => 10,
            'window_minutes' => 15,
            'block_minutes' => 60,
        ],
    ],

];

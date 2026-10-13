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

];

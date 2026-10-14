<?php

declare(strict_types=1);

namespace App\Security;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final readonly class LoginLockout
{
    private Repository $cache;

    public function __construct(
        private int $maxFailures,
        private int $windowMinutes,
        private int $blockMinutes,
        ?string $cacheStore,
    ) {
        $this->cache = Cache::store($cacheStore);
    }

    public static function fromConfig(): self
    {
        return new self(
            maxFailures: self::configInt('max_failures', 10),
            windowMinutes: self::configInt('window_minutes', 15),
            blockMinutes: self::configInt('block_minutes', 60),
            cacheStore: self::configString('cache_store'),
        );
    }

    public function secondsBlocked(string $ip): int
    {
        $blockedUntil = $this->cache->get($this->blockKey($ip));

        if (! is_numeric($blockedUntil)) {
            return 0;
        }

        return max(0, (int) $blockedUntil - now()->getTimestamp());
    }

    public function recordFailure(string $ip, ?string $email): void
    {
        Log::warning('auth.failed', ['ip' => $ip, 'email' => $email]);

        $this->cache->add($this->failuresKey($ip), 0, now()->addMinutes($this->windowMinutes));
        $failures = $this->cache->increment($this->failuresKey($ip));

        if (is_int($failures) && $failures >= $this->maxFailures) {
            $this->block($ip, $failures);
        }
    }

    public function clearFailures(string $ip): void
    {
        $this->cache->forget($this->failuresKey($ip));
    }

    private function block(string $ip, int $failures): void
    {
        $blockedUntil = now()->addMinutes($this->blockMinutes);

        $this->cache->put($this->blockKey($ip), $blockedUntil->getTimestamp(), $blockedUntil);
        $this->clearFailures($ip);

        Log::warning('auth.lockout', ['ip' => $ip, 'failures' => $failures, 'minutes' => $this->blockMinutes]);
    }

    private function failuresKey(string $ip): string
    {
        return 'login-failures:'.$ip;
    }

    private function blockKey(string $ip): string
    {
        return 'login-lockout:'.$ip;
    }

    private static function configInt(string $key, int $default): int
    {
        $value = config('finance.security.login_lockout.'.$key);

        return is_numeric($value) ? (int) $value : $default;
    }

    private static function configString(string $key): ?string
    {
        $value = config('finance.security.login_lockout.'.$key);

        return is_string($value) && $value !== '' ? $value : null;
    }
}

<?php

declare(strict_types=1);

namespace App\Providers;

use App\Console\Input\PasswordInput;
use App\Console\Input\StdinPasswordInput;
use App\Domain\Period\PeriodResolver;
use App\Models\Setting;
use App\Security\LoginLockout;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

final class AppServiceProvider extends ServiceProvider
{
    /**
     * @var array<class-string, class-string>
     */
    public array $bindings = [
        PasswordInput::class => StdinPasswordInput::class,
    ];

    public function register(): void
    {
        $this->app->bind(
            PeriodResolver::class,
            fn (): PeriodResolver => new PeriodResolver(Setting::current()->month_start_day),
        );

        $this->app->bind(LoginLockout::class, fn (): LoginLockout => LoginLockout::fromConfig());
    }

    public function boot(): void
    {
        Event::listen(DiagnosingHealth::class, function (): void {
            DB::connection()->select('SELECT 1');
        });

        Sanctum::getAccessTokenFromRequestUsing(fn (): ?string => null);

        Event::listen(Failed::class, function (Failed $event): void {
            $email = $event->credentials['email'] ?? null;

            app(LoginLockout::class)->recordFailure(self::clientIp(), is_string($email) ? $email : null);
        });

        Event::listen(Login::class, function (): void {
            app(LoginLockout::class)->clearFailures(self::clientIp());
        });

        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(self::apiRequestsPerMinute())->by(
            self::userThrottleKey($request),
        ));

        RateLimiter::for('login', fn (Request $request): Limit => Limit::perMinute(5)->by(
            self::loginThrottleKey($request),
        ));

        RateLimiter::for('captures', fn (Request $request): Limit => Limit::perHour(self::capturesPerHour())->by(
            self::userThrottleKey($request),
        ));

        RateLimiter::for('exports', fn (Request $request): Limit => Limit::perMinute(6)->by(
            self::userThrottleKey($request),
        ));

        RateLimiter::for('password', fn (Request $request): Limit => Limit::perMinute(5)->by(
            self::passwordThrottleKey($request),
        ));
    }

    private static function loginThrottleKey(Request $request): string
    {
        $email = $request->input('email');

        return (is_string($email) ? Str::lower(trim($email)) : '').'|'.$request->ip();
    }

    private static function clientIp(): string
    {
        return request()->ip() ?? 'unknown';
    }

    private static function apiRequestsPerMinute(): int
    {
        $value = config('finance.security.api_rate_limit_per_minute');

        return is_numeric($value) && (int) $value > 0 ? (int) $value : 120;
    }

    private static function capturesPerHour(): int
    {
        $value = config('finance.capture.rate_limit_per_hour');

        return is_numeric($value) ? (int) $value : 60;
    }

    private static function userThrottleKey(Request $request): string
    {
        $userId = $request->user()?->getAuthIdentifier();

        return is_scalar($userId) ? (string) $userId : (string) $request->ip();
    }

    private static function passwordThrottleKey(Request $request): string
    {
        $userId = $request->user()?->getAuthIdentifier();

        return (is_scalar($userId) ? (string) $userId : '').'|'.$request->ip();
    }
}

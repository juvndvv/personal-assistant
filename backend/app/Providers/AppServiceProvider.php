<?php

declare(strict_types=1);

namespace App\Providers;

use App\Console\Input\PasswordInput;
use App\Console\Input\StdinPasswordInput;
use App\Domain\Period\PeriodResolver;
use App\Models\Setting;
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
    }

    public function boot(): void
    {
        Event::listen(DiagnosingHealth::class, function (): void {
            DB::connection()->select('SELECT 1');
        });

        Sanctum::getAccessTokenFromRequestUsing(fn (): ?string => null);

        RateLimiter::for('login', fn (Request $request): Limit => Limit::perMinute(5)->by(
            self::loginThrottleKey($request),
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

    private static function passwordThrottleKey(Request $request): string
    {
        $userId = $request->user()?->getAuthIdentifier();

        return (is_scalar($userId) ? (string) $userId : '').'|'.$request->ip();
    }
}

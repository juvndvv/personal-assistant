<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Security\LoginLockout;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final readonly class BlockAfterFailedLogins
{
    public function __construct(private LoginLockout $lockout) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $secondsBlocked = $this->lockout->secondsBlocked($request->ip() ?? 'unknown');

        if ($secondsBlocked > 0) {
            return response()->json(
                ['message' => __('auth.ip_blocked'), 'code' => 'ip_blocked'],
                Response::HTTP_FORBIDDEN,
                ['Retry-After' => (string) $secondsBlocked],
            );
        }

        return $next($request);
    }
}

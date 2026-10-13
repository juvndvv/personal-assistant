<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\LoginRequest;
use App\Http\Requests\Api\V1\UpdatePasswordRequest;
use App\Http\Resources\Api\V1\UserResource;
use App\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Validation\ValidationException;

final class AuthController extends Controller
{
    private const int HTTP_SESSION_EXPIRED = 419;

    public function login(LoginRequest $request): UserResource
    {
        abort_unless($request->hasSession(), self::HTTP_SESSION_EXPIRED, 'Session required.');

        $guard = $this->guard();

        if (! $guard->attempt($request->credentials(), $request->remember())) {
            throw ValidationException::withMessages(['email' => __('auth.failed')]);
        }

        $request->session()->regenerate();

        $user = $guard->user();
        abort_unless($user instanceof User, Response::HTTP_UNAUTHORIZED);

        return new UserResource($user);
    }

    public function logout(Request $request): Response
    {
        $guard = $this->guard();
        $guard->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        Cookie::queue(Cookie::forget($guard->getRecallerName()));

        return response()->noContent();
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($this->authenticatedUser($request));
    }

    public function updatePassword(UpdatePasswordRequest $request): Response
    {
        $user = $this->authenticatedUser($request);
        $user->forceFill(['password' => $request->newPassword()])->save();

        $this->guard()->logoutOtherDevices($request->newPassword());
        $request->session()->regenerate();

        return response()->noContent();
    }

    private function guard(): SessionGuard
    {
        return Auth::guard('web');
    }

    private function authenticatedUser(Request $request): User
    {
        $user = $request->user();

        abort_unless($user instanceof User, Response::HTTP_UNAUTHORIZED);

        return $user;
    }
}

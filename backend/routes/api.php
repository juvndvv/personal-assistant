<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AccountsController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CategoriesController;
use App\Http\Controllers\Api\V1\PeriodsController;
use App\Http\Controllers\Api\V1\SettingsController;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:login')
    ->name('auth.login');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::put('auth/password', [AuthController::class, 'updatePassword'])
        ->middleware('throttle:password')
        ->name('auth.password');

    Route::get('settings', [SettingsController::class, 'show'])->name('settings.show');
    Route::patch('settings', [SettingsController::class, 'update'])->name('settings.update');

    Route::get('periods/current', [PeriodsController::class, 'current'])->name('periods.current');
    Route::get('periods/resolve', [PeriodsController::class, 'resolve'])->name('periods.resolve');
    Route::get('periods', [PeriodsController::class, 'index'])->name('periods.index');

    Route::apiResource('accounts', AccountsController::class);
    Route::post('accounts/{account}/archive', [AccountsController::class, 'archive'])->name('accounts.archive');
    Route::post('accounts/{account}/unarchive', [AccountsController::class, 'unarchive'])->name('accounts.unarchive');
    Route::get('accounts/{account}/balance', [AccountsController::class, 'balance'])->name('accounts.balance');
    Route::post('accounts/{account}/adjustments', [AccountsController::class, 'storeAdjustment'])->name('accounts.adjustments.store');

    Route::apiResource('categories', CategoriesController::class)->except(['show']);
    Route::post('categories/{category}/archive', [CategoriesController::class, 'archive'])->name('categories.archive');
    Route::post('categories/{category}/unarchive', [CategoriesController::class, 'unarchive'])->name('categories.unarchive');
});

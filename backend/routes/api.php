<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AccountsController;
use App\Http\Controllers\Api\V1\AttachmentsController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CapturesController;
use App\Http\Controllers\Api\V1\CategoriesController;
use App\Http\Controllers\Api\V1\DraftsController;
use App\Http\Controllers\Api\V1\PeriodsController;
use App\Http\Controllers\Api\V1\QuickAddController;
use App\Http\Controllers\Api\V1\RecurringForecastController;
use App\Http\Controllers\Api\V1\RecurringTemplatesController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Controllers\Api\V1\TagsController;
use App\Http\Controllers\Api\V1\TransactionsController;
use App\Http\Controllers\Api\V1\TransfersController;
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
    Route::get('accounts/{account}/settlement-suggestion', [AccountsController::class, 'settlementSuggestion'])->name('accounts.settlement-suggestion');

    Route::apiResource('categories', CategoriesController::class)->except(['show']);
    Route::post('categories/{category}/archive', [CategoriesController::class, 'archive'])->name('categories.archive');
    Route::post('categories/{category}/unarchive', [CategoriesController::class, 'unarchive'])->name('categories.unarchive');

    Route::get('quick-add/defaults', [QuickAddController::class, 'defaults'])->name('quick-add.defaults');

    Route::apiResource('transactions', TransactionsController::class);
    Route::post('transactions/{transaction}/restore', [TransactionsController::class, 'restore'])
        ->withTrashed()
        ->name('transactions.restore');

    Route::apiResource('transfers', TransfersController::class)->except(['index']);
    Route::post('transfers/{transfer}/restore', [TransfersController::class, 'restore'])
        ->withTrashed()
        ->name('transfers.restore');

    Route::apiResource('tags', TagsController::class)->except(['show']);

    Route::post('captures', [CapturesController::class, 'store'])
        ->middleware('throttle:captures')
        ->name('captures.store');

    Route::get('drafts', [DraftsController::class, 'index'])->name('drafts.index');
    Route::get('drafts/{draft}', [DraftsController::class, 'show'])->whereNumber('draft')->name('drafts.show');
    Route::post('drafts/{draft}/discard', [DraftsController::class, 'discard'])->whereNumber('draft')->name('drafts.discard');

    Route::get('transactions/{transaction}/attachments', [AttachmentsController::class, 'index'])
        ->whereNumber('transaction')
        ->name('transactions.attachments.index');
    Route::post('transactions/{transaction}/attachments', [AttachmentsController::class, 'store'])
        ->whereNumber('transaction')
        ->name('transactions.attachments.store');
    Route::apiResource('recurring-templates', RecurringTemplatesController::class)->whereNumber('recurring_template');
    Route::post('recurring-templates/{recurring_template}/pause', [RecurringTemplatesController::class, 'pause'])
        ->whereNumber('recurring_template')
        ->name('recurring-templates.pause');
    Route::post('recurring-templates/{recurring_template}/resume', [RecurringTemplatesController::class, 'resume'])
        ->whereNumber('recurring_template')
        ->name('recurring-templates.resume');
    Route::get('recurring/forecast', [RecurringForecastController::class, 'show'])->name('recurring.forecast');

    Route::get('attachments/{attachment}', [AttachmentsController::class, 'show'])->name('attachments.show');
    Route::delete('attachments/{attachment}', [AttachmentsController::class, 'destroy'])->name('attachments.destroy');
});

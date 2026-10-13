<?php

declare(strict_types=1);

namespace App\Actions\Settings;

use App\Models\Account;
use App\Models\Setting;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class UpdateSettings
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function handle(array $attributes): Setting
    {
        return DB::transaction(function () use ($attributes): Setting {
            $settings = Setting::query()->lockForUpdate()->findOrFail(Setting::SINGLETON_ID);
            $settings->fill(Arr::only($attributes, ['month_start_day', 'default_account_id', 'orphan_draft_ttl_days']));

            if ($settings->isDirty('default_account_id') && $settings->default_account_id !== null) {
                $this->ensureWritableAccount($settings->default_account_id);
            }

            $settings->save();

            return $settings;
        });
    }

    private function ensureWritableAccount(int $accountId): void
    {
        $writable = Account::query()->active()->whereKey($accountId)->exists();

        if (! $writable) {
            throw ValidationException::withMessages([
                'default_account_id' => 'La cuenta por defecto debe existir y no estar archivada.',
            ]);
        }
    }
}

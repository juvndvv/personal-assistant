<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\Settings\UpdateSettings;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\UpdateSettingsRequest;
use App\Http\Resources\Api\V1\SettingsResource;
use App\Models\Setting;

final class SettingsController extends Controller
{
    public function show(): SettingsResource
    {
        return new SettingsResource(Setting::current());
    }

    public function update(UpdateSettingsRequest $request, UpdateSettings $updateSettings): SettingsResource
    {
        return new SettingsResource($updateSettings->handle($request->validated()));
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Actions\QuickAdd\QuickAddDefaults;
use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\QuickAddDefaultsResource;

final class QuickAddController extends Controller
{
    public function defaults(QuickAddDefaults $quickAddDefaults): QuickAddDefaultsResource
    {
        return new QuickAddDefaultsResource($quickAddDefaults->handle());
    }
}

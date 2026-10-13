<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

Schedule::command('app:drafts:purge')
    ->dailyAt('03:30')
    ->timezone('Europe/Madrid')
    ->withoutOverlapping();

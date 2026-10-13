<?php

declare(strict_types=1);

namespace App\Console\Input;

final class StdinPasswordInput implements PasswordInput
{
    public function readLine(): ?string
    {
        $line = fgets(STDIN);

        return $line === false ? null : $line;
    }
}

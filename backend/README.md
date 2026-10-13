# Finance backend

Laravel 13 API (`/api/v1`) for the personal finance app. See `../docs/plan/` for the contract, data model and decisions.

## Commands

| Task | Command |
|---|---|
| Create the single user | `php artisan app:create-user you@example.com --name="You"` (or `--password-stdin`) |
| Format check | `composer lint` |
| Static analysis | `composer stan` |
| Tests | `composer test` or `php artisan test --parallel` |

Tests run on PostgreSQL (`finance_test`). Override the connection with `DB_HOST`, `DB_PORT`, `DB_USERNAME` and `DB_PASSWORD`. No test can reach a real AI provider: stray HTTP requests and transcriptions are blocked globally in `tests/Pest.php`.

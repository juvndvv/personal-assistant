# AI evaluation samples

`php artisan app:ai-eval tests/Fixtures/ai-eval` runs every sample in this directory through the
real capture pipeline (configured provider and models from `.env`, `CaptureProcessor` and
`SanitizeExtraction`) and prints per-field accuracy and latency (p50, p90, max). It calls the real
provider, costs money and is never run in CI. Run it before changing `AI_*_MODEL` or
`AI_*_PROVIDER`, and log the results in `docs/plan/QA_LOG.md` (target: p50 < 5 s).

Samples are private and git-ignored; only this README is committed. Anonymize them first (no
names, card numbers or addresses you would not want sent to the provider).

## Layout

One sample file plus an expectation file with the same base name:

```
mercadona-visa.m4a
mercadona-visa.expected.json
ticket-farmacia.jpg
ticket-farmacia.expected.json
```

Supported extensions: `m4a`, `aac`, `webm`, `ogg`, `mp3`, `wav` (voice) and `jpg`, `jpeg`,
`png`, `webp` (receipt photos).

## Expectation file

Only the listed fields are scored. Ids refer to the accounts and categories of the database the
command runs against, so run it on a copy of your real data (or the dev seed with matching ids).

```json
{
  "today": "2026-10-13",
  "type": "expense",
  "amount_cents": 2000,
  "date": "2026-10-13",
  "account_id": 7,
  "category_id": 11,
  "merchant": "Mercadona"
}
```

`today` (optional) pins the reference date used for relative expressions such as "ayer".
`description` and `merchant` are compared case-insensitively after trimming; every other field
must match exactly.

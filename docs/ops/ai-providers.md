# AI providers

Voice and photo capture use the Laravel AI SDK (`laravel/ai`). The provider and model names live
only in `backend/config/ai.php` (section `finance`) and `.env`; application code never names a
provider or model (an arch test fails on literals such as `gpt-`, `whisper`, `claude-`, `gemini-`
in `backend/app`). Switching between the options below is a `.env` change followed by
`php artisan config:cache` (or a container restart).

| Variable | Meaning | Default |
|---|---|---|
| `AI_EXTRACTION_PROVIDER` | Provider for text and image extraction (`TransactionExtractor`) | `openai` |
| `AI_EXTRACTION_MODEL` | Vision-capable model with structured outputs; empty = provider default | empty |
| `AI_TRANSCRIPTION_PROVIDER` | Speech-to-text provider | `openai` |
| `AI_TRANSCRIPTION_MODEL` | Transcription model; empty = provider default | empty |
| `AI_TIMEOUT` | Seconds per provider call (capped by the time left before the capture deadline) | `12` |
| `AI_FAILOVER` | Comma-separated extraction providers tried, in order, when the primary one is overloaded, rate limited or unreachable. Only use external providers here (TRD 6.3). | empty |
| `CAPTURE_DEADLINE_SECONDS` | Overall processing budget of `POST /captures` | `15` |

Each provider also needs its own credentials (see the `providers` block of `config/ai.php`).
After any change run `php artisan app:ai-eval tests/Fixtures/ai-eval` on the private sample set
and log accuracy and latency in `docs/plan/QA_LOG.md` (`backend/tests/Fixtures/ai-eval/README.md`).

## Option A: OpenAI only (default, ADR-002)

Model names checked against OpenAI's model list on 2026-10-13: `gpt-6-luna` (most efficient
GPT-6 model, image input and structured outputs, Responses and Chat Completions) and
`gpt-transcribe` (file transcription on `v1/audio/transcriptions`). If extraction is slower than
the 5 s target, compare with `gpt-4o-mini-transcribe` for speech first.

```dotenv
OPENAI_API_KEY=sk-...
AI_EXTRACTION_PROVIDER=openai
AI_EXTRACTION_MODEL=gpt-6-luna
AI_TRANSCRIPTION_PROVIDER=openai
AI_TRANSCRIPTION_MODEL=gpt-transcribe
AI_TIMEOUT=12
AI_FAILOVER=
```

## Option B: mixed providers

Speech-to-text and extraction can come from different providers. Example: Groq for fast speech
recognition and Anthropic or Gemini for extraction, with OpenAI as the extraction fallback.
Pick model ids from each provider's current documentation and verify them with `app:ai-eval`.

```dotenv
GROQ_API_KEY=gsk_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

AI_TRANSCRIPTION_PROVIDER=groq
AI_TRANSCRIPTION_MODEL=<groq speech-to-text model id>
AI_EXTRACTION_PROVIDER=anthropic
AI_EXTRACTION_MODEL=<vision-capable model id>
AI_FAILOVER=openai
```

A failover provider uses its own default text model (`models.text.default` in its
`config/ai.php` block, or the SDK default).

## Option C: local OpenAI-compatible servers

For local inference (for example a whisper.cpp or faster-whisper server for speech and a
vision model behind an OpenAI-compatible API such as vLLM, llama.cpp server or Ollama's
`/v1` endpoint). The `openai-compatible` provider in `config/ai.php` reads its URL, key and
default models from the variables below. Leave `AI_FAILOVER` empty unless you deliberately
want captures to leave the machine when the local server is down.

```dotenv
OPENAI_COMPATIBLE_URL=http://192.168.1.20:8000/v1
OPENAI_COMPATIBLE_API_KEY=local
OPENAI_COMPATIBLE_TEXT_MODEL=<vision model served locally>
OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL=<speech model served locally>

AI_EXTRACTION_PROVIDER=openai-compatible
AI_EXTRACTION_MODEL=
AI_TRANSCRIPTION_PROVIDER=openai-compatible
AI_TRANSCRIPTION_MODEL=
AI_TIMEOUT=12
AI_FAILOVER=
```

The local extraction model must support image input and JSON-schema structured output,
otherwise photo captures fail and fall back to an empty draft (manual entry keeps working).

## Docker Compose

The `x-app` environment block in `compose.yaml` passes every AI variable to the `web`, `worker`
and `scheduler` containers (and to `migrate` in production): `OPENAI_API_KEY`,
`AI_EXTRACTION_PROVIDER`, `AI_EXTRACTION_MODEL`, `AI_TRANSCRIPTION_PROVIDER`,
`AI_TRANSCRIPTION_MODEL`, `AI_TIMEOUT`, `AI_FAILOVER`, `CAPTURE_DEADLINE_SECONDS`,
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY` and the
`OPENAI_COMPATIBLE_*` variables. Switching between options A, B and C, or enabling failover, only
needs the root `.env` to change followed by `docker compose up -d`; `compose.yaml` stays untouched.
`make config` (and CI) runs `scripts/check-compose-env.sh` to prove these variables reach every
app service.

## Privacy

Only the audio or the receipt image, today's date and weekday, and the catalog of active
accounts (id, name, type) and categories (id, name, kind, parent) are sent. Movement history is
never sent. Receipts stay on the private `receipts` disk; the provider receives them only for
the single extraction call.

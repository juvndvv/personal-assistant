#!/usr/bin/env bash
set -euo pipefail

app_services=(web worker scheduler)
required_variables=(
  OPENAI_API_KEY
  AI_EXTRACTION_PROVIDER
  AI_EXTRACTION_MODEL
  AI_TRANSCRIPTION_PROVIDER
  AI_TRANSCRIPTION_MODEL
  AI_TIMEOUT
  AI_FAILOVER
  CAPTURE_DEADLINE_SECONDS
  ANTHROPIC_API_KEY
  GEMINI_API_KEY
  MISTRAL_API_KEY
  GROQ_API_KEY
  OPENAI_COMPATIBLE_URL
  OPENAI_COMPATIBLE_API_KEY
  OPENAI_COMPATIBLE_TEXT_MODEL
  OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL
  API_RATE_LIMIT_PER_MINUTE
  LOGIN_LOCKOUT_CACHE_STORE
)

rendered="$(docker compose "$@" config --format json)"
failures=0

for service in "${app_services[@]}"; do
  for variable in "${required_variables[@]}"; do
    if ! jq -e --arg service "$service" --arg variable "$variable" \
      '.services[$service].environment | has($variable)' <<<"$rendered" >/dev/null; then
      printf 'compose-env: FAIL %s is missing %s\n' "$service" "$variable" >&2
      failures=$((failures + 1))
    fi
  done
done

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

printf 'compose-env: ok   %d AI and security variables reach %s\n' "${#required_variables[@]}" "${app_services[*]}"

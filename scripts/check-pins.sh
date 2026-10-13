#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

failures=0

fail() {
  printf 'check-pins: %s\n' "$1" >&2
  failures=$((failures + 1))
}

upper() {
  tr '[:lower:]' '[:upper:]' <<< "$1"
}

locally_built_image='personal-finance'
exact_version='^[0-9]+\.[0-9]+(\.[0-9]+)?([-+][0-9A-Za-z.-]+)?$'
exact_image_tag='^[0-9]+\.[0-9]+([.-][0-9A-Za-z.]+)*$'

check_package_json() {
  local file="$1"
  local entries
  entries="$(jq -r '
    [ (.dependencies // {}), (.devDependencies // {}), (.optionalDependencies // {}) ]
    | map(to_entries[]) | .[] | "\(.key)\t\(.value)"
  ' "$file")"
  entries+=$'\n'"$(jq -r '
    (.overrides // {}) | paths(scalars) as $path
    | "\($path | map(tostring) | join(" > "))\t\(getpath($path))"
  ' "$file")"

  while IFS=$'\t' read -r name version; do
    [[ -z "$name" ]] && continue
    if [[ ! "$version" =~ $exact_version ]]; then
      fail "$file: $name has non-exact version '$version'"
    fi
  done <<< "$entries"
}

check_image_reference() {
  local file="$1" reference="$2"
  [[ "$reference" == *"\${"* ]] && return 0
  [[ "$reference" == "$locally_built_image":* ]] && return 0
  if [[ "$reference" == *@sha256:* ]]; then
    return 0
  fi
  local without_registry="${reference##*/}"
  if [[ "$without_registry" != *:* ]]; then
    fail "$file: image '$reference' has no tag"
    return 0
  fi
  local tag="${without_registry##*:}"
  if [[ "$tag" == *latest* ]]; then
    fail "$file: image '$reference' uses a 'latest' tag"
  elif [[ ! "$tag" =~ $exact_image_tag ]]; then
    fail "$file: image '$reference' is not pinned to an exact version"
  fi
}

check_dockerfile() {
  local file="$1"
  local -a stages=()
  while read -r keyword reference rest; do
    case "$(upper "$keyword")" in
      FROM)
        if [[ "$reference" == --platform=* ]]; then
          read -r reference rest <<< "$rest"
        fi
        local is_stage=false
        for stage in "${stages[@]+"${stages[@]}"}"; do
          [[ "$stage" == "$reference" ]] && is_stage=true
        done
        $is_stage || check_image_reference "$file" "$reference"
        if [[ "$(upper "$rest")" =~ ^AS[[:space:]]+([^[:space:]]+) ]]; then
          stages+=("$(tr '[:upper:]' '[:lower:]' <<< "${BASH_REMATCH[1]}")")
        fi
        ;;
    esac
  done < <(grep -iE '^[[:space:]]*FROM[[:space:]]' "$file")

  while read -r reference; do
    local is_stage=false
    for stage in "${stages[@]+"${stages[@]}"}"; do
      [[ "$stage" == "$reference" ]] && is_stage=true
    done
    $is_stage || check_image_reference "$file" "$reference"
  done < <(grep -oE -- '--from=[^[:space:]]+' "$file" | sed 's/^--from=//')
}

check_yaml_images() {
  local file="$1"
  while read -r reference; do
    [[ -z "$reference" ]] && continue
    check_image_reference "$file" "$reference"
  done < <(grep -E '^[[:space:]]*(-[[:space:]]+)?image:[[:space:]]*' "$file" \
    | sed -E 's/^[[:space:]]*(-[[:space:]]+)?image:[[:space:]]*//; s/[[:space:]]+#.*$//; s/^["'"'"']//; s/["'"'"']$//')
}

check_workflow() {
  local file="$1"
  check_yaml_images "$file"
  while read -r action; do
    [[ "$action" == ./* || "$action" == docker://* ]] && continue
    local ref="${action##*@}"
    if [[ "$action" != *@* ]]; then
      fail "$file: action '$action' has no version"
    elif [[ ! "$ref" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ && ! "$ref" =~ ^[0-9a-f]{40}$ ]]; then
      fail "$file: action '$action' is not pinned to an exact release tag or commit"
    fi
  done < <(grep -E '^[[:space:]]*(-[[:space:]]+)?uses:' "$file" \
    | sed -E 's/^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*//; s/[[:space:]]+#.*$//; s/^["'"'"']//; s/["'"'"']$//')
  if grep -nE 'runs-on:.*-latest' "$file" >/dev/null; then
    fail "$file: runner label uses '-latest'"
  fi
}

while IFS= read -r file; do
  check_package_json "$file"
  lock="$(dirname "$file")/package-lock.json"
  [[ -f "$lock" ]] || fail "$file: missing committed package-lock.json"
done < <(find . -name package.json -not -path '*/node_modules/*' -not -path './backend/vendor/*' -not -path '*/dist/*' -not -path '*/.angular/*')

[[ -f backend/composer.lock ]] || fail "backend/composer.lock is missing"

while IFS= read -r file; do
  check_dockerfile "$file"
done < <(find . \( -name Dockerfile -o -name '*.Dockerfile' -o -name 'Dockerfile.*' \) -not -path '*/node_modules/*' -not -path './backend/vendor/*')

while IFS= read -r file; do
  check_yaml_images "$file"
done < <(find . -maxdepth 1 \( -name 'compose*.yaml' -o -name 'compose*.yml' -o -name 'docker-compose*.yml' \))

if [[ -d .github/workflows ]]; then
  while IFS= read -r file; do
    check_workflow "$file"
  done < <(find .github/workflows -name '*.yml' -o -name '*.yaml')
fi

if grep -rnE '(:|@)latest([^A-Za-z0-9_-]|$)' --include='Dockerfile*' --include='compose*.yaml' --include='*.yml' --include='Makefile' --include='*.sh' \
  --exclude='check-pins.sh' --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git . ; then
  fail "found a 'latest' reference (listed above)"
fi

if ((failures > 0)); then
  printf 'check-pins: %d problem(s) found\n' "$failures" >&2
  exit 1
fi

printf 'check-pins: all versions are pinned\n'

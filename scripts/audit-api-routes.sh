#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if rg -n "['\"\`]/?authsec/|['\"\`]uflow/uflow|['\"\`]/spiresvc/|['\"\`][^'\"]*scopes/map(['\"\`]|$)" src/app/api; then
  echo "API route audit failed."
  exit 1
fi

echo "API route audit passed."

#!/usr/bin/env bash
# Flags API paths in src/app/api that are known to be wrong.
# Exit codes: 0 = clean, 1 = a forbidden path was found, 2 = could not run.
set -euo pipefail

cd "$(dirname "$0")/.."

# Fail closed: without ripgrep nothing is checked, which must not read as a
# pass (UI-031).
if ! command -v rg >/dev/null 2>&1; then
  echo "API route audit could not run: ripgrep (rg) is not installed." >&2
  exit 2
fi

# Forbidden: a doubled uflow prefix, the retired /spiresvc/ root, and the
# removed scopes/map route. (Paths under /authsec/ are the convention now;
# the old rule that forbade them is gone.)
pattern="['\"\`][^'\"\`]*uflow/uflow|['\"\`]/spiresvc/|['\"\`][^'\"]*scopes/map(['\"\`]|$)"

status=0
rg -n "$pattern" src/app/api || status=$?

case "$status" in
  0)
    echo "API route audit failed." >&2
    exit 1
    ;;
  1)
    echo "API route audit passed."
    ;;
  *)
    echo "API route audit could not run: rg exited with status $status." >&2
    exit 2
    ;;
esac

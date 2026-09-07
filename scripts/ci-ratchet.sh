#!/usr/bin/env bash
# Compare a check's failures on this branch against the same check on the merge
# base, and fail only when this branch makes things WORSE.
#
# WHY A RATCHET. Both of this repo's gates were useless in opposite directions.
# The type gate ran the root tsconfig, which has "files": [] and only project
# references, so it compiled nothing and passed unconditionally -- two real type
# errors reached a green PR. The lint gate ran the whole tree at
# --max-warnings 0 against 939 pre-existing problems, so it failed every PR
# including one that changed nothing, which trains people to ignore it.
#
# A gate that never fails and a gate that always fails carry the same amount of
# information: none. Ratcheting fixes both without demanding a 939-problem
# cleanup first: existing debt is tolerated, new debt is refused, and the number
# can only go down.
set -uo pipefail

MODE="${1:?usage: ci-ratchet.sh <typecheck|lint> <base-ref>}"
BASE="${2:?missing base ref}"

# Both tools exit non-zero when they find anything, which is the normal case
# here -- so each counter runs in a subshell with pipefail OFF and returns a
# bare integer. With pipefail on, the tool's exit code propagates through the
# pipe, fires the fallback, and the function emits TWO numbers; the comparison
# below then silently misreads and the gate stops meaning anything.
count_typecheck() (
  set +o pipefail
  npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"
)
list_typecheck() (
  set +o pipefail
  npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS"
)
count_lint() (
  set +o pipefail
  npx eslint src --format json 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        const r = JSON.parse(s);
        console.log(r.reduce((n, f) => n + f.errorCount + f.warningCount, 0));
      } catch { console.log("PARSE_FAILED"); }
    });'
)
list_lint() (
  set +o pipefail
  npx eslint src 2>/dev/null | tail -40
)

# A count that is not a plain integer means the tool itself broke. Fail closed:
# a gate that cannot measure must not report success.
require_int() {
  case "$1" in
    ''|*[!0-9]*) echo "FAIL: $2 produced a non-numeric result: '$1'"; exit 1 ;;
  esac
}

head_count="$(count_$MODE)"
require_int "$head_count" "$MODE on head"
echo "::group::$MODE on this branch: $head_count problem(s)"
list_$MODE | head -40
echo "::endgroup::"

# Measure the base with this branch's dependencies already installed; only the
# tracked sources change. Any failure to check out the base is reported rather
# than silently treated as zero, which would turn the ratchet into a rubber stamp.
if ! git worktree add --detach /tmp/ci-base "$BASE" >/dev/null 2>&1; then
  echo "Could not check out base $BASE — cannot compare. Failing closed."
  exit 1
fi
ln -s "$PWD/node_modules" /tmp/ci-base/node_modules
base_count="$(cd /tmp/ci-base && count_$MODE)"
git worktree remove --force /tmp/ci-base >/dev/null 2>&1
require_int "$base_count" "$MODE on base"

echo "base ($BASE): $base_count"
echo "head:          $head_count"

if [ "$head_count" -gt "$base_count" ]; then
  echo ""
  echo "FAIL: this branch adds $((head_count - base_count)) new $MODE problem(s)."
  echo "Pre-existing problems are tolerated; new ones are not."
  exit 1
fi

if [ "$head_count" -lt "$base_count" ]; then
  echo "Improved by $((base_count - head_count)). Ratchet tightens."
fi
echo "PASS: no new $MODE problems."

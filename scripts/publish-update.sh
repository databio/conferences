#!/usr/bin/env bash
# Check a conference update, then commit it to the shared conference-update
# branch and open or update the one "Conference update" pull request. It never
# merges.
#
# The scheduled workflow runs this as a Claude Code Stop hook: Claude Code runs
# it automatically when Claude finishes. So it runs inside the Claude step with
# Claude's GitHub login, and the pull request is opened by claude[bot].
#
# Exit codes follow Claude Code's hook rules:
#   0  published, or nothing to publish
#   2  a check failed: the output goes back to Claude, which fixes the data and
#      stops again, which runs this script again (at most 3 tries)
#   1  anything else: Claude stops, and the workflow's last step fails the run
set -uo pipefail
exec 1>&2  # Claude reads hook feedback from stderr
cd "$(dirname "$0")/.."

BRANCH=conference-update
PATHS=(data/conferences.json automation/research-state/)
BODY=/tmp/conference-pr-body.md
DONE=/tmp/conference-publish.done
TRIES_FILE=/tmp/conference-publish.tries
MAX_TRIES=3
: "${START_SHA:?START_SHA must be set by the workflow setup step}"

git fetch -q origin main || exit 1

tries=$(( $(cat "$TRIES_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$tries" > "$TRIES_FILE"
if ! { node scripts/conference-state.mjs sync &&
       node scripts/conference-state.mjs validate &&
       node scripts/normalize.mjs data/conferences.json &&
       node scripts/validate.mjs &&
       node scripts/validate-update.mjs origin/main &&
       git diff --check; }; then
  if [ "$tries" -lt "$MAX_TRIES" ]; then
    echo "A check failed (try $tries of $MAX_TRIES). Fix the data, never the tools, then finish again."
    exit 2
  fi
  echo "Checks still fail after $MAX_TRIES tries. Nothing was published."
  exit 1
fi

set -e

# Commit only the update paths, as claude[bot]. If Claude committed on its own,
# fold that back into the working tree first so only these paths are kept.
git reset -q "$START_SHA"
# status (not diff) so a newly created research-state year file counts.
if [ -n "$(git status --porcelain -- "${PATHS[@]}")" ]; then
  git add -- "${PATHS[@]}"
  git -c user.name="claude[bot]" \
      -c user.email="209825114+claude[bot]@users.noreply.github.com" \
      commit -q -m "Conference update"
fi

# Compare branch contents directly with main. Do not use triple-dot here:
# after a squash merge it can make already-merged data look pending.
if git diff --quiet origin/main HEAD -- "${PATHS[@]}"; then
  echo "No pending conference or research-state changes; nothing to review"
  touch "$DONE"
  exit 0
fi

# The setup step may have reset a stale branch to main, so this can rewrite the
# remote branch. The lease refuses if the branch changed since setup fetched it.
git push -q --force-with-lease origin "HEAD:refs/heads/$BRANCH"

[ -s "$BODY" ] || echo "Automated refresh of conference dates and deadlines." > "$BODY"
printf '\n---\n_Merging redeploys conferences.databio.org with the updated data._\n' |
  cat "$BODY" - > "$BODY.final"

PR_NUMBER=$(gh pr list --state open --head "$BRANCH" --base main \
  --json number --jq '.[0].number // empty')
if [ -n "$PR_NUMBER" ]; then
  gh pr edit "$PR_NUMBER" --body-file "$BODY.final"
  echo "Updated pull request #$PR_NUMBER"
else
  gh pr create --base main --head "$BRANCH" --title "Conference update" \
    --body-file "$BODY.final" --label conference-update
fi
touch "$DONE"

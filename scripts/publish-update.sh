#!/usr/bin/env bash
# Publish a conference update for human review: run every check, commit the
# data changes to the shared conference-update branch, push it, and open or
# update the one "Conference update" pull request. It never merges.
#
# The scheduled workflow's Claude step runs this as its last action, so the
# commit, the push, and the pull request all use Claude's GitHub login
# (claude[bot]). A failed check stops the script before anything is pushed.
#
# Needs START_SHA and REMOTE_SHA, which the workflow's setup step exports.
set -euo pipefail

BRANCH=conference-update
BODY=/tmp/conference-pr-body.md
FINAL_BODY=/tmp/conference-pr-body.final.md
DONE=/tmp/conference-publish.done
PATHS=(data/conferences.json automation/research-state/)
: "${START_SHA:?START_SHA must be set by the workflow setup step}"
REMOTE_SHA=${REMOTE_SHA-}

rm -f "$DONE"
git fetch -q origin main

node scripts/conference-state.mjs sync
node scripts/conference-state.mjs validate
node scripts/normalize.mjs data/conferences.json
node scripts/validate.mjs
node scripts/validate-update.mjs origin/main
git diff --check

# Commit only the update paths. If anything was committed earlier in the run,
# fold it back into the working tree first so only these paths are kept.
git reset -q "$START_SHA"
# status (not diff) so a newly created research-state year file counts.
if [ -n "$(git status --porcelain -- "${PATHS[@]}")" ]; then
  git add -- "${PATHS[@]}"
  git commit -q -m "Conference update"
fi

# Compare branch contents directly with main. Do not use triple-dot here:
# after a squash merge it can make already-merged data look pending.
if git diff --quiet origin/main HEAD -- "${PATHS[@]}"; then
  echo "No pending conference or research-state changes; nothing to review"
  touch "$DONE"
  exit 0
fi

# The setup step may have reset a stale local branch to main, so this push can
# rewrite the remote branch. The lease refuses if anything else changed it
# during this run (an empty REMOTE_SHA means the branch must not exist yet).
git push -q --force-with-lease="refs/heads/$BRANCH:$REMOTE_SHA" origin "HEAD:refs/heads/$BRANCH"

if [ -s "$BODY" ]; then cp "$BODY" "$FINAL_BODY"; else
  echo "Automated refresh of conference dates and deadlines." > "$FINAL_BODY"
fi
printf '\n---\n_Merging redeploys conferences.databio.org with the updated data._\n' >> "$FINAL_BODY"

PR_NUMBER=$(gh pr list --state open --head "$BRANCH" --base main \
  --json number --jq '.[0].number // empty')
if [ -n "$PR_NUMBER" ]; then
  gh pr edit "$PR_NUMBER" --body-file "$FINAL_BODY"
  echo "Updated pull request #$PR_NUMBER"
else
  gh pr create --base main --head "$BRANCH" --title "Conference update" \
    --body-file "$FINAL_BODY" --label conference-update
fi
touch "$DONE"

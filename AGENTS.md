# Agent instructions

## Conference update

For any task that researches or updates conference dates and deadlines, read
and follow `automation/update-conferences.md` completely.

For ChatGPT Scheduled Task runs:

- Use the connected GitHub repository as the source of current state.
- Use the shared branch `conference-update` for conference refreshes.
- First check for an open pull request whose head branch is
  `conference-update`.
  - If one exists, continue from that branch. Treat its version of
    `data/conferences.json` as the current state so pending verified changes are
    preserved and new findings are added to the same review PR.
  - If none exists, start `conference-update` from the current `main` branch.
- Never discard or overwrite valid unmerged changes already present on
  `conference-update`.
- If no verified conference information changed, make no repository changes.
- If verified changes exist, update only `data/conferences.json` and preserve
  the canonical JSON normalization rules in `automation/update-conferences.md`.
- If there is already an open `conference-update` PR, push the new changes to
  that branch so the existing PR is updated. Otherwise open a pull request
  against `main` titled `Conference update` and include the canonical review
  summary. Apply the `conference-update` and `needs-review` labels when
  available.
- Never merge the pull request automatically.

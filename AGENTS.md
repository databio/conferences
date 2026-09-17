# Agent instructions

## Conference update

For any task that researches or updates conference dates and deadlines, read
and follow `automation/update-conferences.md` completely.

For ChatGPT Scheduled Task runs:

- Use the connected GitHub repository as the source of current state.
- Before making changes, check for an open pull request labeled
  `conference-update`. If one is already open, make no changes and stop; the
  next scheduled run re-scans the current and next year and will rediscover
  anything still missing.
- If no verified conference information changed, make no repository changes.
- If verified changes exist, create a branch from `main`, update only
  `data/conferences.json`, and preserve the canonical JSON normalization rules
  in `automation/update-conferences.md`.
- Open a pull request against `main` titled `Conference update` and include the
  canonical review summary. Apply the `conference-update` and `needs-review`
  labels when available.
- Never merge the pull request automatically.

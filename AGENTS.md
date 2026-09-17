# Agent instructions

## Conference update

For any task that researches or updates conference dates and deadlines, read
and follow `automation/update-conferences.md` completely.

For ChatGPT Scheduled Task runs:

- Use the connected GitHub repository as the source of current state.
- Use the shared branch `conference-update` for conference refreshes.
- First check whether the remote `conference-update` branch exists.
  - If it exists, start from that branch and treat its version of
    `data/conferences.json` as the current state. Preserve all valid unmerged
    changes already present there.
  - If it does not exist, create `conference-update` from the current `main`.
- Check whether an open pull request already uses `conference-update` as its
  head branch.
- Research and apply only verified conference changes. Never discard or
  overwrite valid pending changes already on the shared branch.
- Update only `data/conferences.json` and preserve the canonical JSON
  normalization rules in `automation/update-conferences.md`.
- If research finds no new verified changes, do not create an unnecessary data
  commit. However, if `conference-update` already differs from `main` and has no
  open PR, open the review PR for those pending changes.
- If an open `conference-update` PR already exists, push any new commit to the
  same branch so that PR is updated. Otherwise, when the shared branch differs
  from `main`, open a pull request against `main` titled `Conference update`
  and include the canonical review summary. Apply the `conference-update` and
  `needs-review` labels when available.
- Never merge the pull request automatically.

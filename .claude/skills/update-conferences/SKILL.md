---
name: update-conferences
description: Run the recurring computational-biology conference refresh using the repository's canonical instructions.
---

# Update the conference list

Follow `automation/update-conferences.md` completely.

For Claude Code runs only:

- The workflow has already selected the shared `conference-update` branch. If
  that remote branch existed, the working tree starts from it; otherwise the
  workflow created it from current `main`.
- Treat the checked-out `data/conferences.json` as the authoritative current
  state and preserve all valid pending changes already present.
- Edit `data/conferences.json` in place according to the canonical procedure.
- Do all research synchronously in this run; do not delegate to background
  agents or end the run waiting for another process to continue the research.
- Write the review summary to `/tmp/conference-pr-body.md` using the canonical
  sections: **New this cycle**, **Updated**, **Not found / left alone**, and
  **Flagged**.
- Do not create or merge a pull request yourself. The GitHub workflow handles
  normalization, validation, shared-branch updates, and PR creation after
  Claude finishes.
- If no verified changes are found, leave `data/conferences.json` untouched.

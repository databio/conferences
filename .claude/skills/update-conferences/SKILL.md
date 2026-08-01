---
name: update-conferences
description: Refresh computational-biology conference dates and deadlines for the target year(s) by editing data/conferences.json in place, so the change is reviewable as a PR diff. Use when asked to update or refresh the conference list.
---

# Update the conference list

Refresh computational-biology conference dates and deadlines by editing the
source-of-truth file `data/conferences.json` in place. Editing it (rather than
rewriting) makes changes show up as a real line diff in the pull request, so a
reviewer sees exactly what changed. This repo is the single source of truth —
merging a PR redeploys the API with the new data. There is no database.

## CRITICAL: how to execute this (read first)

- **Do all the work yourself, in this one session, synchronously.** Do NOT
  spawn subagents, background tasks, or the Task/Agent tool. There is no
  orchestrator that will re-invoke you — if you delegate and end your turn, the
  run ends and nothing is saved.
- **Do not end your turn until your edits to `data/conferences.json` are saved**
  (or you determined, after doing the research, that nothing changed and
  deliberately left the file untouched). "I'll wait for X" is a failure — there
  is nobody to wait for.
- Research conferences one at a time with WebSearch/WebFetch in your own turn.

## Inputs

- **The data file**: `data/conferences.json`. Read it first — it holds every
  conference currently tracked. Shape: `{ "conferences": [ ... ] }`.
- **Master list of what to track**: `scripts/recurring_conferences.seed.yaml`
  (name, full_name, search_terms, typical_month, website_pattern). Treat this as
  the authoritative set of conferences to look for.
- **Target year**: default to the current calendar year and the next year.

## Process

1. **Read current state and the master list**
   ```bash
   cat data/conferences.json
   cat scripts/recurring_conferences.seed.yaml
   ```

2. **For each recurring conference, find the target-year instance.** Use the
   `search_terms` / `website_pattern` to find the official site via WebSearch,
   then WebFetch it. Extract, from the official site only: `location`,
   `start_date`/`end_date` (ISO `YYYY-MM-DD`), `link` (that year's homepage),
   and `deadlines` as `[{name, date}]` (common names: "Abstracts", "Paper",
   "Proceedings", "Early registration"). If the year's site isn't published or a
   field is genuinely unknown, **omit it — do not guess.** A wrong date on a
   public page is worse than a missing one.

3. **Edit the data file in place.**
   - Present and unchanged → leave the row exactly as is (don't reformat).
   - Present but a field changed → edit only that field.
   - New conference-year → add an object to the `conferences` array.

   Entry shape (only `name` + `year` required; omit fields you can't fill):
   ```json
   {
     "name": "ISMB",
     "full_name": "Intelligent Systems for Molecular Biology",
     "year": 2026,
     "location": "Washington DC, USA",
     "start_date": "2026-07-12",
     "end_date": "2026-07-16",
     "link": "https://www.iscb.org/ismb2026",
     "deadlines": [
       { "name": "Proceedings", "date": "2026-01-23" },
       { "name": "Abstracts", "date": "2026-04-17" }
     ]
   }
   ```
   `name` + `year` are the identity key. Keep `name` **stable** across years
   (always `"ISMB"`) — a changed name creates a duplicate instead of updating.
   A normalization step re-sorts rows and keys after you, so don't worry about
   ordering or formatting — just make correct edits.

4. **If nothing changed**, leave the file untouched and say so. The workflow
   opens no PR when the file is unchanged.

## PR summary

When you change the file, **also write the PR summary to
`/tmp/conference-pr-body.md`** (Markdown) — the workflow feeds it in as the PR
body. Cover: **New this cycle** (added, with dates), **Updated** (each change as
`old → new`), **Not found / left alone** (year site not up yet), **Flagged**
(anything a reviewer should double-check). End your turn with the same summary.

## Important rules

- **Official sources only.** Dates come from the conference's own website.
- **Omit, don't guess.** A missing field is fine; a wrong one is not.
- **Stable names.** `name` must match the existing row exactly or you duplicate.
- **Edit in place.** Don't rewrite untouched rows — keep the diff small.
- **No subagents. Synchronous only.** See the CRITICAL section above.

# Update the computational-biology conference list

Refresh conference dates and deadlines by editing the source-of-truth file
`data/conferences.json` in place.

This is the canonical procedure for the recurring conference update. Agent-
specific wrappers should primarily point here rather than duplicate these rules.
They may control environment-specific mechanics, but they must not weaken or
replace the research, verification, editing, branch, review, or publication
rules in this file.

The repository is the single source of truth. Merging a pull request redeploys
the API with the new data. There is no database.

## Inputs

- **Current data:** `data/conferences.json`. Read it first. It has shape
  `{ "conferences": [ ... ] }`.
- **Master tracking list:** `scripts/recurring_conferences.seed.yaml`, containing
  stable names, full names, search terms, typical months, and website patterns.
- **Target years:** the current calendar year and the next calendar year unless
  the task explicitly says otherwise.

## Recurring automation workflow

For recurring automated conference refreshes, use the shared durable branch
`conference-update`.

- First check whether the remote `conference-update` branch exists.
  - If it exists, start from that branch. Treat its version of
    `data/conferences.json` as the current state and preserve all valid unmerged
    changes already present there.
  - If it does not exist, create `conference-update` from the current `main`.
- Check whether an open pull request already uses `conference-update` as its
  head branch.
- Never discard or overwrite valid pending changes already on the shared branch.
- The conference refresh itself may update only `data/conferences.json`.
- If research finds no new verified data changes, do not create an unnecessary
  data commit. However, if `conference-update` already differs from `main` and
  has no open pull request, open the review pull request for those pending
  changes.
- If an open `conference-update` pull request already exists, push any new data
  commit to the same branch so that pull request is updated.
- Otherwise, when `conference-update` differs from `main`, open a pull request
  against `main` titled `Conference update` and include the review summary
  defined below.
- Apply the `conference-update` and `needs-review` labels when available.
- Never merge or enable automatic merging. Human review is required.

## Process

### 1. Read current state and tracking configuration

Read both `data/conferences.json` and
`scripts/recurring_conferences.seed.yaml` before researching anything.

For recurring automation, read `data/conferences.json` from the established
`conference-update` working branch, not from `main`, so valid pending changes are
preserved.

The stable identity key for a conference instance is `name` + `year`. Never
change a recurring conference's stable `name` merely because its branding or
website title changed.

### 2. Research each recurring conference

For each tracked conference, find the target-year official conference site.
Use the configured search terms and website pattern as guidance.

Use **official conference or organizing-society sources only** for facts written
into the dataset. Search engines may help locate the official page, but search
snippets, aggregators, deadline-list sites, social posts, and third-party event
pages are not authoritative evidence for a date.

Extract only information that is explicitly supported by the official source:

- `location`
- `start_date` and `end_date`, as ISO `YYYY-MM-DD`
- `link`, pointing to that year's official homepage when available
- `deadlines` as objects of `{ "name": ..., "date": "YYYY-MM-DD" }`

Typical deadline labels include `Abstracts`, `Paper`, `Proceedings`, and
`Early registration`, but preserve the official meaning rather than forcing a
label that does not fit.

If the target-year site is not published, or a field is genuinely unknown,
omit it or leave the existing value untouched as appropriate. **Never infer or
guess a date.**

For deadlines that are already in the past:

- Correct an existing deadline when an official source clearly shows the stored
  value is wrong. Historical accuracy is still useful.
- Do not add a previously missing deadline solely for historical completeness
  after that deadline has already passed.
- Prioritize newly published or changed dates and deadlines that are still
  current or actionable.

### 3. Decide whether each row needs a change

For each conference-year instance:

- Present and unchanged: leave the row unchanged.
- Present with a newly verified changed field: change only that field.
- Missing target-year instance with enough verified information: add a new row.
- Official information is absent or ambiguous: make no change and record it in
  the review summary as not found / left alone when useful.

Do not make cosmetic edits to unrelated rows.

### 4. Preserve the data model

A conference entry has this general shape; only `name` and `year` are required:

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

Keep `name` stable across years. A changed `name` creates a duplicate series
instead of updating the intended conference.

### 5. Canonicalize the JSON

The repository's canonical normalization is defined by
`scripts/normalize.mjs`. The resulting `data/conferences.json` must follow these
rules:

- rows sorted by `year` ascending, then `name` ascending
- keys ordered as:
  `name`, `full_name`, `year`, `location`, `start_date`, `end_date`, `link`,
  `note`, `attending`, `slug`, `deadlines`
- empty optional fields omitted
- `attending` included only when true
- deadlines sorted by `date`, then `name`
- two-space JSON indentation and a trailing newline

If the execution environment supports Node, run:

```bash
node scripts/normalize.mjs data/conferences.json
node scripts/validate.mjs
```

If arbitrary shell execution is not available, write the JSON directly in this
canonical form. Pull-request CI performs repository validation as a final
backstop.

### 6. Prepare the review summary

When changes are made, the pull-request description or equivalent review
summary should contain these sections:

- **New this cycle** — newly added conference-year instances and their dates
- **Updated** — each material change, preferably as `old → new`
- **Not found / left alone** — name each tracked conference that was checked but
  left unchanged because the target-year official page or relevant fields could
  not be verified. Be specific about what was unavailable when useful; do not
  use vague phrases such as "several conferences."
- **Flagged** — anything a reviewer should double-check

Keep the summary factual and link to official sources for material updates when
possible.

### 7. If nothing changed

Make no data change and do not create an empty commit. For recurring automation,
still follow the durable-branch workflow above: if valid pending changes already
exist on `conference-update` and no review pull request is open, open that pull
request without manufacturing a new data commit.

## Important rules

- **Official sources only.** Write dates and locations only from authoritative
  conference or organizing-society pages.
- **Omit, don't guess.** Missing information is preferable to incorrect public
  data.
- **Stable names.** Preserve the existing recurring `name` exactly.
- **Small diffs.** Change only verified fields and new rows; do not rewrite
  unrelated content.
- **Current + next year by default.** Re-scan both on every recurring run so
  later-published information is naturally picked up.
- **Past deadlines: correct, don't backfill.** Fix an existing wrong past
  deadline when verified, but do not add missing deadlines that are already
  over solely to improve historical completeness.
- **Review summary must be specific.** Name conferences left unchanged because
  official information could not be verified.
- **Durable review branch.** Preserve valid unmerged work already on
  `conference-update` and continue its existing pull request when present.
- **Only the data file changes during a refresh.** Automated conference refreshes
  modify only `data/conferences.json`.
- **Human review.** Never merge or enable automatic merging of the conference
  update pull request.

# Update the computational-biology conference list

Refresh conference dates and deadlines by editing the source-of-truth file
`data/conferences.json` and the persistent research state under
`automation/research-state/`.

This is the canonical procedure for recurring conference updates. Agent-specific
wrappers should point here rather than duplicate these rules.

## Non-negotiable scope

During a conference refresh, you may modify only:

- `data/conferences.json`
- `automation/research-state/YYYY.json`, and normally only through
  `scripts/conference-state.mjs`

**Run the existing CLI, validation scripts, package scripts, workflows, and these
instructions as-is. Do not edit, delete, replace, simplify, or disable them during
a conference refresh.** Infrastructure changes are a separate maintenance task.

## Inputs

- **Public conference data:** `data/conferences.json`
- **Master tracking list:** `scripts/recurring_conferences.seed.yaml`
- **Persistent research state:** `automation/research-state/YYYY.json`
- **Research-state CLI:** `scripts/conference-state.mjs`

The public data remains authoritative for conference facts. Research-state files
contain workflow metadata only: phase, discovered deadline pages, check dates,
and optional notes.

## Start every run from the work queue

Before researching:

```bash
git fetch origin main
node scripts/conference-state.mjs sync
node scripts/conference-state.mjs todo
```

Work only on items returned by `todo`. Phase 4 items are intentionally omitted.
Do not independently rescan every conference-year. `sync` always covers the
current and next calendar year and creates a missing year file (for example, on
the first run in January); commit that new file with the rest of the run.

Pass conference names to the CLI exactly as `todo` prints them. A name that is
not already tracked is an error, not a new entry.

The CLI uses a seven-day lightweight-check cadence and a 28-day full deadline
rediscovery cadence. A Phase 3 item marked `FULL` needs both its cached-page
check and a broader official-site deadline rediscovery.

## Research phases

### Phase 1 — initialization

Goal: establish the conference-year instance once.

Find the official target-year conference source and record, when explicitly
published:

- `location`
- `start_date`
- `end_date`
- `link` to the official target-year homepage

Use official conference or organizing-society sources only.

Start from what earlier runs found. For each Phase 1 item, `todo` shows the
fields already `known`, the ones still `missing`, saved `lead page`s, and any
`note`. Open the lead pages first, research only the missing fields, and do not
redo work that is already recorded.

Record each field in `data/conferences.json` as soon as an official source
publishes it, even if others are still missing (for example, a location
announced before the dates). When you find an official page that announces the
target year but is not yet its full homepage (an announcement, save-the-date,
or future-meetings page), save it so the next run starts there:

```bash
node scripts/conference-state.mjs add-lead-page YEAR "Conference name" "https://official.example/announcement"
```

Leave a short note when it would save the next run time:

```bash
node scripts/conference-state.mjs set YEAR "Conference name" --phase 1 --note "location announced; dates not yet published"
```

If the official target-year details are not published yet, leave the
conference in Phase 1 and record the attempt so it is retried next week:

```bash
node scripts/conference-state.mjs checked YEAR "Conference name"
```

"Not published yet" is never a reason for Phase 4.

Never fill a target-year row by copying another year's row. The link, dates,
location, and `full_name` (including any edition number such as "14th") must
come from the target year's own official page. `validate.mjs` rejects a link
that names only a different year and an edition number already used by another
year; `validate-update.mjs` warns when dates and location exactly match another
year.

Once those fields are established, run:

```bash
node scripts/conference-state.mjs sync
node scripts/conference-state.mjs checked YEAR "Conference name"
```

The CLI will move a fully initialized instance to Phase 2.

**Do not relitigate Phase 1 facts during routine Phase 2 or Phase 3 work.**
Correct them only when there is explicit evidence that an existing value is
wrong.

If an official source establishes that the conference is not held that year,
mark it complete with that source as evidence:

```bash
node scripts/conference-state.mjs set YEAR "Conference name" --phase 4 \
  --evidence "https://official.example/page" --note "not held in YEAR: <reason>"
```

The CLI and `validate` refuse Phase 4 for a conference that is not over yet
unless it has both `--evidence` and `--note`.

### Phase 2 — deadline discovery

Goal: thoroughly discover where the official site publishes deadlines.

Start from the official conference-year homepage already stored in
`data/conferences.json`. Traverse official navigation and relevant internal
pages, especially pages described like:

- Key Dates / Key Dates & Deadlines
- Important Dates / Deadlines
- Call for Papers / CFP
- Call for Abstracts
- Submission / Author Information
- Registration

Use targeted official-domain search when useful. A homepage without deadlines is
not enough evidence that deadlines are unavailable.

When you discover an official page that contains, or is clearly intended to
contain, conference deadlines, save it immediately:

```bash
node scripts/conference-state.mjs add-deadline-page YEAR "Conference name" "https://official.example/page"
```

`deadline_pages` is a discovered cache, not hardcoded configuration. If a saved
page later disappears, redirects to irrelevant content, or is superseded, remove
it and rediscover:

```bash
node scripts/conference-state.mjs remove-deadline-page YEAR "Conference name" "https://old.example/page"
```

Add all still-relevant, explicitly published submission, abstract, paper,
poster, registration, or similar deadlines to `data/conferences.json`.

Phase 2 is itself a thorough/full discovery pass. After completing it, mark the
attempt as a full check:

```bash
node scripts/conference-state.mjs checked YEAR "Conference name" --full
```

If no deadline page or actionable deadline is published yet, leave the
conference in Phase 2. Once at least one useful deadline page is saved, the CLI
moves the conference to Phase 3.

### Phase 3 — deadline monitoring

Goal: check known deadline sources cheaply and repeatedly without restarting
discovery from scratch.

For a normal weekly Phase 3 item:

1. Check every URL in its cached `deadline_pages`.
2. Capture newly published deadlines, corrections, and extensions.
3. Do not re-research location, conference dates, or the homepage unless a
   cached deadline page is broken or clearly stale.
4. Mark it checked with:
   ```bash
   node scripts/conference-state.mjs checked YEAR "Conference name"
   ```

When `todo` marks a Phase 3 item as `FULL`, also do a broader official-site
deadline rediscovery to see whether new deadline pages appeared or old ones were
replaced. Then mark:

```bash
node scripts/conference-state.mjs checked YEAR "Conference name" --full
```

### Phase 4 — complete/archive

Phase 4 receives no routine research. `sync` automatically moves conferences
with a known past `end_date`, and every conference in a past calendar year, to
Phase 4. A maintainer or agent may also set
Phase 4 after verifying, with an official `--evidence` URL, that a conference
is not held that year.

Historical corrections may still be made when explicitly requested, but routine
weekly updates do not reopen Phase 4.

## Deadline rules

- Use official conference or organizing-society sources only.
- Never guess a date.
- Correct an existing deadline when an official source proves it wrong.
- Do not add a previously missing deadline after it has already passed merely
  for historical completeness.
- Prefer future/actionable deadlines.

## Data model and normalization

Keep the stable identity key `name` + `year`. Never rename a recurring series
because its branding changed.

Only change verified fields. Avoid cosmetic edits.

Before finishing, run all deterministic checks:

```bash
git fetch origin main
node scripts/conference-state.mjs sync
node scripts/conference-state.mjs validate
node scripts/normalize.mjs data/conferences.json
node scripts/validate.mjs
node scripts/validate-update.mjs origin/main
git diff --check
```

These commands are validators/tools to run, not files to modify.

## Review summary

Before writing the summary, inspect:

```bash
git diff -- data/conferences.json automation/research-state/
```

Reconcile the summary against the actual diff.

Use these sections:

- **New this cycle**
- **Updated**
- **Not found / left alone**
- **Research state** — useful phase transitions or newly discovered
  `deadline_pages`
- **Flagged**

For "not found" claims, include the official source(s) actually checked when
practical.

## Recurring branch workflow

For wrappers using the shared `conference-update` branch, compare current file
contents directly against `main`, not merge-base history. Pending update paths
are:

- `data/conferences.json`
- `automation/research-state/`

When continuing an existing `conference-update` branch, first merge current
`origin/main` into it, so the run uses the current CLI, validators, and these
instructions. If that merge conflicts, stop and flag it for a human.

A stale shared branch whose pending update paths are identical to `main` after
that merge should be reset to current `main`. Never merge or enable automatic merging; human
review is required.

## Useful CLI commands

```bash
# Work queue; Phase 4 is omitted
node scripts/conference-state.mjs todo
node scripts/conference-state.mjs todo --json

# Initialize a new conference year from the recurring-conference list
node scripts/conference-state.mjs init-year 2028

# Reconcile phases with the public dataset
node scripts/conference-state.mjs sync

# Inspect one item
node scripts/conference-state.mjs show 2027 RECOMB

# Manually change a phase
node scripts/conference-state.mjs set 2027 RECOMB --phase 2

# Persist a discovered official deadline page
node scripts/conference-state.mjs add-deadline-page 2027 RECOMB "https://..."

# Persist a Phase 1 lead (announcement or save-the-date page)
node scripts/conference-state.mjs add-lead-page 2027 "Galaxy Community Conference" "https://..."

# Record completion of a check
node scripts/conference-state.mjs checked 2027 RECOMB
node scripts/conference-state.mjs checked 2027 RECOMB --full
```

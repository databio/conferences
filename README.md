# conferences.databio.org

An **AI-curated, git-backed API of computational-biology conferences and their deadlines.**

Most conference-deadline sites are a static countdown page over a YAML file with no API, and they go stale when the community stops contributing. This one is different in two ways: it exposes a real **query API** (so humans *and* AI agents can pull current data), and the dataset is kept fresh by a **weekly AI-curation task** on top of community PRs.

Scope: **computational biology / bioinformatics / genomics** conferences with deadlines.

## Source of truth

The dataset is a single file — [`data/conferences.json`](data/conferences.json) — shaped `{ "conferences": [ ... ] }`. It is bundled into a Cloudflare Worker at deploy time and served from memory at the edge. There is **no database**: reads come from the file, corrections are GitHub PRs.

Each record: `name`, `year`, optional `full_name`, `location`, `start_date`, `end_date`, `link`, `deadlines: [{name, date}]`, `note`, `attending`, `slug`. The API derives a stable series `slug` and instance `id` (`slug-year`) unless `slug` is set. See [`schema.json`](schema.json).

## API

Base URL: `https://conferences.databio.org`

| Endpoint | What |
|---|---|
| `GET /conferences` | list instances — filters `year, from, to, location, q, upcoming` |
| `GET /deadlines` | flat, date-sorted deadline feed — filters `from, to, days, kind` |
| `GET /{slug}` | a conference series (all tracked years), e.g. `/ismb` |
| `GET /{slug}/{year}` | one instance, e.g. `/recomb/2027` |
| `GET /{slug}/{year}/deadlines` · `/calendar.ics` | that instance's deadlines / calendar |
| `GET /calendar.ics` | subscribable iCal of upcoming deadlines (accepts the same filters) |
| `GET /conferences.json` · `/conferences.csv` | bulk export |
| `GET /openapi.json` · `/schema.json` · `/llms.txt` | machine/AI descriptors |
| `GET /stats` | counts, coverage, last-updated |
| `POST /suggest` | `{name, year, ...}` → a prefilled GitHub issue link |

## Develop

```bash
npm install
npm run test             # unit tests (vitest)
npm run typecheck        # tsc --noEmit
npm run validate         # lint data/conferences.json
npm run validate:update  # rules for a change, compared with main
npm run state:todo       # research work queue (see below)
npm run dev              # wrangler dev (local)
```

## Automated curation

A scheduled AI agent refreshes the data every week. Everything it follows lives
in this repository:

- [`AGENTS.md`](AGENTS.md): the entry point for any agent.
- [`automation/update-conferences.md`](automation/update-conferences.md): the
  full procedure. Official sources only, never guess a date, change only
  verified fields.
- [`scripts/recurring_conferences.seed.yaml`](scripts/recurring_conferences.seed.yaml):
  the conference series tracked each year.

Research happens in phases, and progress is saved between runs in
`automation/research-state/YYYY.json`, one file per year. The CLI
[`scripts/conference-state.mjs`](scripts/conference-state.mjs) manages these
files and always covers the current and next calendar year.

| Phase | What the agent does |
|---|---|
| 1. Initialization | Find the year's official page, location, and dates. |
| 2. Deadline discovery | Find the official pages that list deadlines. |
| 3. Deadline monitoring | Recheck saved deadline pages weekly, with a full rediscovery every 28 days. |
| 4. Complete | Nothing. Set automatically once the conference ends, or earlier only with an official source showing it will not be held. |

Each run starts from `node scripts/conference-state.mjs todo`, which lists only
the items that are due, along with what earlier runs already found, so work is
not repeated.

Every run ends in a pull request for human review; nothing merges on its own.
Merge or close each run's pull request before the next run, because every run
updates the research-state files. The manual Claude Code workflow in
`.github/workflows/scheduled-conference-update.yml` runs the same procedure as
a fallback, on the `conference-update` branch.

## Checks

CI runs on every pull request and push to `main`:

- `data/conferences.json` must already be in canonical form (`scripts/normalize.mjs`).
- `npm run validate`: required fields, `YYYY-MM-DD` dates, no unknown keys, and
  no rows that look copied from another year (a link that names a different
  year, or a repeated edition number such as "14th").
- `npm run validate:update`: compared with `main`, no end date before a start
  date and no newly added deadline that has already passed. It also warns when
  a changed row has the same location and dates as another year.
- `npm run state:validate`: research-state files are well formed, and nothing is
  archived early without an official source.
- `npm run typecheck` and `npm test`.
- Pull requests from `conference-update*` branches may change only
  `data/conferences.json` and `automation/research-state/`.

## Contributing

Add or fix a conference by editing `data/conferences.json` and opening a PR — see [CONTRIBUTING.md](CONTRIBUTING.md). CI validates the file on every PR.

## License

Code: MIT ([LICENSE](LICENSE)). Data: CC-BY 4.0 ([LICENSE-data](LICENSE-data)).

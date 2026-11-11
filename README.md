# conferences.databio.org

An **AI-curated, git-backed API of computational-biology conferences and their deadlines.**

Most conference-deadline sites are a static countdown page over a YAML file with no API, and they go stale when the community stops contributing. This one is different in two ways: it exposes a real **query API** (so humans *and* AI agents can pull current data), and the dataset is kept fresh by a **weekly AI-curation task** on top of community PRs.

Scope: **computational biology / bioinformatics / genomics** conferences with deadlines.

## Data

The conference list lives in [`data/conferences.json`](data/conferences.json):
one record per conference per year, inside `{ "conferences": [ ... ] }`. The file
is bundled into a Cloudflare Worker at deploy time and served from memory.
There is **no database**: the API reads this file, and corrections are pull
requests.

### Data model

A **conference** record is one meeting of a series in one year, such as ISMB
2027. Its **deadlines** are the dated milestones before the meeting, such as
the abstract or paper deadline.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | Short series name, the same every year, e.g. `ISMB` |
| `year` | integer | yes | Year of the meeting |
| `full_name` | string | | Longer name, e.g. `18th ACM BCB` |
| `location` | string | | City and region or country |
| `start_date`, `end_date` | date | | First and last day, `YYYY-MM-DD` |
| `link` | URL | | Official page for this year's meeting |
| `deadlines` | list | | Milestones, each `{ "name", "date" }`. `name` is a label such as `Abstracts` or `Full papers`; `date` is `YYYY-MM-DD` |
| `note` | string | | Free-text note |
| `attending` | boolean | | Lab-internal: the lab plans to attend |
| `slug` | string | | Overrides the series ID the API derives from `name` |

Example:

```json
{
  "name": "ACM BCB",
  "full_name": "18th ACM BCB",
  "year": 2027,
  "location": "Boston, MA",
  "start_date": "2027-08-10",
  "end_date": "2027-08-13",
  "link": "https://acmbcb.hosting.acm.org/",
  "deadlines": [
    { "name": "Abstract preregistration", "date": "2027-03-19" },
    { "name": "Full papers", "date": "2027-03-26" }
  ]
}
```

From each record the API derives a series `slug` (`acm-bcb`), an instance `id`
(`acm-bcb-2027`), and a deadline `id` (`acm-bcb-2027:full-papers`). The
`/deadlines` feed also lists each meeting's start date as a `Conference`
deadline. The JSON Schema is [`schema.json`](schema.json). The updater's
research notes are kept separately in `automation/research-state/` and are not
served.

## API

Base URL: `https://conferences.databio.org`

| Endpoint | What |
|---|---|
| `GET /conferences` | list instances; filters `year, from, to, location, q, upcoming` |
| `GET /deadlines` | flat, date-sorted deadline feed; filters `from, to, days, kind` |
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

A GitHub Actions workflow,
[`scheduled-conference-update.yml`](.github/workflows/scheduled-conference-update.yml),
runs Claude Code every Monday at 09:00 UTC to refresh the data. It can also be
started by hand from the Actions tab. Everything it follows lives in this
repository:

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

Every run works on the shared `conference-update` branch and opens or updates
one "Conference update" pull request for human review; nothing merges on its
own. Claude does the research; when it finishes, a hook runs
[`scripts/publish-update.sh`](scripts/publish-update.sh), which runs the checks
(failures go back to Claude), commits, pushes, and opens the pull request as
`claude[bot]`. Merge or close that pull request before the next run, because every run
updates the research-state files.

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

Add or fix a conference by editing `data/conferences.json` and opening a PR; see [CONTRIBUTING.md](CONTRIBUTING.md). CI validates the file on every PR.

## License

Code: MIT ([LICENSE](LICENSE)). Data: CC-BY 4.0 ([LICENSE-data](LICENSE-data)).

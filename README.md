# conferences.databio.org

An **AI-curated, git-backed API of computational-biology conferences and their deadlines.**

Most conference-deadline sites are a static countdown page over a YAML file with no API, and they go stale when the community stops contributing. This one is different in two ways: it exposes a real **query API** (so humans *and* AI agents can pull current data), and the dataset is kept fresh by a **monthly AI-curation agent** on top of community PRs.

Scope: **computational biology / bioinformatics / genomics** conferences with deadlines.

## Source of truth

The dataset is a single file — [`data/conferences.json`](data/conferences.json) — shaped `{ "conferences": [ ... ] }`. It is bundled into a Cloudflare Worker at deploy time and served from memory at the edge. There is **no database**: reads come from the file, corrections are GitHub PRs.

Each record: `name`, `year`, optional `full_name`, `location`, `start_date`, `end_date`, `link`, `deadlines: [{name, date}]`, `note`. The API derives a stable series `slug` and instance `id` (`slug-year`). See [`schema.json`](schema.json).

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
npm run test        # unit tests (vitest)
npm run typecheck   # tsc --noEmit
npm run validate    # lint data/conferences.json
npm run dev         # wrangler dev (local)
```

## Contributing

Add or fix a conference by editing `data/conferences.json` and opening a PR — see [CONTRIBUTING.md](CONTRIBUTING.md). CI validates the file on every PR.

## License

Code: MIT ([LICENSE](LICENSE)). Data: CC-BY 4.0 ([LICENSE-data](LICENSE-data)).

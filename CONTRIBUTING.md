# Contributing

Thanks for helping keep the list current!

## Add or correct a conference

1. Edit **`data/conferences.json`** (shape `{ "conferences": [ ... ] }`).
2. Add or update an entry:

   ```json
   {
     "name": "ISMB",
     "full_name": "Intelligent Systems for Molecular Biology",
     "year": 2027,
     "location": "Copenhagen, Denmark",
     "start_date": "2027-07-18",
     "end_date": "2027-07-22",
     "link": "https://www.iscb.org/ismb2027/",
     "deadlines": [
       { "name": "Abstracts", "date": "2027-01-30" },
       { "name": "Proceedings", "date": "2027-01-16" }
     ]
   }
   ```

3. Open a pull request. CI runs `npm run validate` — dates must be `YYYY-MM-DD`, `name` and `year` are required, and no unknown keys.

Don't have a GitHub account handy? `POST /suggest` with `{ "name": ..., "year": ... }` returns a prefilled issue link a maintainer can turn into a PR.

## Scope

Computational biology / bioinformatics / genomics conferences with deadlines. Keep the schema minimal — the value is a small, clean, current dataset.

## Notes

- `slug` (series id) is derived from `name` automatically; add an explicit `slug` only to override the derivation or to reconcile a name that drifted across years.
- `attending` is a lab-internal flag and optional; leave it off for community entries.

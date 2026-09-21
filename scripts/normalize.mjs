// Rewrite data/conferences.json canonically so agent edits produce clean diffs:
//   - rows sorted by (year asc, name asc)
//   - object keys in a fixed order
//   - empty fields omitted; `attending` only when true
//   - deadlines sorted by (date, name)
//   - 2-space indent, trailing newline
//
// Usage: node scripts/normalize.mjs [data/conferences.json]
import { readFile, writeFile } from 'node:fs/promises'

const KEY_ORDER = [
  'name', 'full_name', 'year', 'location', 'start_date', 'end_date',
  'link', 'note', 'attending', 'slug', 'deadlines',
]

function canon(raw) {
  const c = { name: String(raw.name ?? ''), year: Number(raw.year) }
  if (raw.full_name) c.full_name = String(raw.full_name)
  for (const k of ['location', 'start_date', 'end_date', 'link', 'note', 'slug']) {
    if (raw[k] != null && String(raw[k]) !== '') c[k] = String(raw[k])
  }
  if (raw.attending === true || raw.attending === 1 || raw.attending === '1') c.attending = true
  if (Array.isArray(raw.deadlines) && raw.deadlines.length) {
    c.deadlines = raw.deadlines
      .map((d) => ({ name: String(d.name ?? ''), date: String(d.date ?? '') }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
  }
  return c
}

function serialize(list) {
  const rows = list
    .map(canon)
    .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
    .map((c) => {
      const o = {}
      for (const k of KEY_ORDER) if (k in c) o[k] = c[k]
      return o
    })
  return JSON.stringify({ conferences: rows }, null, 2) + '\n'
}

const path = process.argv[2] ?? 'data/conferences.json'
const raw = JSON.parse(await readFile(path, 'utf8'))
if (!raw || !Array.isArray(raw.conferences)) {
  console.error(`${path} must be { "conferences": [...] }`)
  process.exit(1)
}
await writeFile(path, serialize(raw.conferences))
console.log(`normalized ${raw.conferences.length} conferences -> ${path}`)

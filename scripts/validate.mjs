// Dependency-free validation of data/conferences.json, run in CI on every PR.
// Checks required fields, ISO dates, deadline shape, and unknown keys. Exits 1
// on any error so a bad PR fails the check.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED = new Set([
  'name', 'full_name', 'year', 'location', 'start_date', 'end_date',
  'link', 'deadlines', 'note', 'attending', 'slug',
])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const YEAR_IN_TEXT = /(?<!\d)20\d{2}(?!\d)/g
const EDITION = /\b(\d+)(?:st|nd|rd|th)\b/i
const errors = []

const raw = JSON.parse(readFileSync(join(root, 'data/conferences.json'), 'utf8'))
if (!raw || !Array.isArray(raw.conferences)) {
  console.error('data/conferences.json must be { "conferences": [...] }')
  process.exit(1)
}

raw.conferences.forEach((c, i) => {
  const at = `conferences[${i}] (${c?.name ?? '?'} ${c?.year ?? '?'})`
  if (typeof c.name !== 'string' || !c.name.trim()) errors.push(`${at}: missing name`)
  if (!Number.isInteger(c.year)) errors.push(`${at}: year must be an integer`)
  for (const f of ['start_date', 'end_date']) {
    if (c[f] != null && !DATE.test(c[f])) errors.push(`${at}: ${f} must be YYYY-MM-DD`)
  }
  for (const k of Object.keys(c)) {
    if (!ALLOWED.has(k)) errors.push(`${at}: unknown key "${k}"`)
  }
  // A row copied from another year often keeps that year's link.
  const linkYears = [...new Set(String(c.link ?? '').match(YEAR_IN_TEXT) ?? [])]
  if (linkYears.length && !linkYears.includes(String(c.year))) {
    errors.push(`${at}: link mentions ${linkYears.join(', ')} but not ${c.year}; is it copied from another year?`)
  }
  if (c.deadlines != null) {
    if (!Array.isArray(c.deadlines)) errors.push(`${at}: deadlines must be an array`)
    else c.deadlines.forEach((d, j) => {
      if (typeof d?.name !== 'string') errors.push(`${at}: deadlines[${j}] missing name`)
      if (!DATE.test(d?.date)) errors.push(`${at}: deadlines[${j}] date must be YYYY-MM-DD`)
    })
  }
})

// Two years of one series cannot be the same numbered edition ("14th Plenary").
const editionYear = new Map()
for (const c of raw.conferences) {
  const edition = String(c.full_name ?? '').match(EDITION)?.[1]
  if (!edition) continue
  const key = `${c.name}\u0000${edition}`
  if (editionYear.has(key) && editionYear.get(key) !== c.year) {
    errors.push(
      `${c.name} ${c.year}: full_name says edition ${edition}, same as ${editionYear.get(key)}; ` +
      'is it copied from another year?',
    )
  } else {
    editionYear.set(key, c.year)
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log(`✓ ${raw.conferences.length} conferences valid`)

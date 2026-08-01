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
  if (c.deadlines != null) {
    if (!Array.isArray(c.deadlines)) errors.push(`${at}: deadlines must be an array`)
    else c.deadlines.forEach((d, j) => {
      if (typeof d?.name !== 'string') errors.push(`${at}: deadlines[${j}] missing name`)
      if (!DATE.test(d?.date)) errors.push(`${at}: deadlines[${j}] date must be YYYY-MM-DD`)
    })
  }
})

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log(`✓ ${raw.conferences.length} conferences valid`)

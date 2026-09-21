// Validate conference-update semantics against the current main branch.
//
// Usage:
//   node scripts/validate-update.mjs [base-ref] [today]
//
// Defaults:
//   base-ref: origin/main (falls back to main)
//   today:    current UTC date, YYYY-MM-DD
//
// This complements scripts/validate.mjs. It checks rules that depend on the
// *change*, not just the final JSON:
//   - conference end_date cannot precede start_date
//   - a previously missing deadline that is already past cannot be newly added
//     solely as historical backfill
//   - correcting the date of an already-existing deadline remains allowed
// It also warns (without failing) when a new or changed row has the same
// location and month/day dates as another year of the series, a sign it was
// copied. Some series really do repeat (PSB is always Jan 3-7 in Hawaii).
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const DATA = 'data/conferences.json'
const requestedBase = process.argv[2] ?? 'origin/main'
const today = process.argv[3] ?? new Date().toISOString().slice(0, 10)
const DATE = /^\d{4}-\d{2}-\d{2}$/

function readJson(text, label) {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || !Array.isArray(parsed.conferences)) {
      throw new Error('expected { "conferences": [...] }')
    }
    return parsed.conferences
  } catch (err) {
    console.error(`Could not parse ${label}: ${err.message}`)
    process.exit(1)
  }
}

function gitShow(ref) {
  return execFileSync('git', ['show', `${ref}:${DATA}`], { encoding: 'utf8' })
}

let baseRef = requestedBase
let baseText
try {
  baseText = gitShow(baseRef)
} catch {
  if (requestedBase !== 'origin/main') throw new Error(`Could not read ${requestedBase}:${DATA}`)
  baseRef = 'main'
  try {
    baseText = gitShow(baseRef)
  } catch {
    console.error('Could not read data/conferences.json from origin/main or main.')
    console.error('Fetch main first, or pass an explicit base ref.')
    process.exit(1)
  }
}

if (!DATE.test(today)) {
  console.error(`today must be YYYY-MM-DD; got ${today}`)
  process.exit(1)
}

const base = readJson(baseText, `${baseRef}:${DATA}`)
const current = readJson(readFileSync(DATA, 'utf8'), DATA)
const errors = []
const warnings = []

const key = (c) => `${c.name}\u0000${c.year}`
const monthDay = (date) => String(date ?? '').slice(5)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function dateSpan(start, end) {
  const [sm, sd] = [MONTHS[Number(start.slice(5, 7)) - 1], Number(start.slice(8))]
  const [em, ed] = [MONTHS[Number(end.slice(5, 7)) - 1], Number(end.slice(8))]
  return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd}–${em} ${ed}`
}
const baseByKey = new Map(base.map((c) => [key(c), c]))

for (const c of current) {
  const at = `${c.name} ${c.year}`

  if (c.start_date && c.end_date && c.end_date < c.start_date) {
    errors.push(`${at}: end_date ${c.end_date} precedes start_date ${c.start_date}`)
  }

  const old = baseByKey.get(key(c))

  if (c.start_date && c.end_date && JSON.stringify(old) !== JSON.stringify(c)) {
    const twin = current.find((o) =>
      o.name === c.name && o.year !== c.year && o.location === c.location &&
      monthDay(o.start_date) === monthDay(c.start_date) && monthDay(o.end_date) === monthDay(c.end_date))
    if (twin) {
      warnings.push(
        `${at} has the same location and dates as ${c.name} ${twin.year} ` +
        `(${c.location}, ${dateSpan(c.start_date, c.end_date)}). You are updating ${c.year}. ` +
        `Confirm on the official ${c.year} page that these really are the ${c.year} details, ` +
        `not copied from ${twin.year}.`,
      )
    }
  }
  const oldDeadlineNames = new Set(
    Array.isArray(old?.deadlines)
      ? old.deadlines.map((d) => String(d?.name ?? '').trim().toLowerCase())
      : [],
  )

  for (const d of Array.isArray(c.deadlines) ? c.deadlines : []) {
    const name = String(d?.name ?? '').trim()
    const normalizedName = name.toLowerCase()
    const date = String(d?.date ?? '')

    // If this deadline label already existed, changing its date is a correction,
    // which is allowed even when the corrected date is historical.
    const existedByName = oldDeadlineNames.has(normalizedName)

    if (!existedByName && DATE.test(date) && date < today) {
      errors.push(
        `${at}: newly added deadline "${name}" (${date}) is already past as of ${today}; ` +
        'do not backfill previously missing historical deadlines',
      )
    }
  }
}

for (const w of warnings) console.warn('WARNING: ' + w)

if (errors.length) {
  console.error(`✗ ${errors.length} update validation error(s) against ${baseRef}:`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

console.log(`✓ update semantics valid against ${baseRef} as of ${today}`)

#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = join(root, 'data', 'conferences.json')
const seedPath = join(root, 'scripts', 'recurring_conferences.seed.yaml')
const stateDir = join(root, 'automation', 'research-state')
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const WEEKLY_DAYS = 7
const FULL_DAYS = 28

function die(message) {
  console.error(message)
  process.exit(1)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function todayFrom(args) {
  const i = args.indexOf('--today')
  const value = i >= 0 ? args[i + 1] : new Date().toISOString().slice(0, 10)
  if (!ISO_DATE.test(value ?? '')) die(`--today must be YYYY-MM-DD; got ${value}`)
  return value
}

function option(args, name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}

function has(args, name) {
  return args.includes(name)
}

function seedNames() {
  const names = []
  for (const line of readFileSync(seedPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*-\s+name:\s+"([^"]+)"\s*$/)
    if (m) names.push(m[1])
  }
  return names
}

function dataRows() {
  const raw = readJson(dataPath)
  if (!raw || !Array.isArray(raw.conferences)) die('data/conferences.json must be { "conferences": [...] }')
  return raw.conferences
}

function statePath(year) {
  return join(stateDir, `${year}.json`)
}

function blankEntry(phase = 1) {
  return {
    phase,
    deadline_pages: [],
    last_checked: null,
    last_full_search: null,
  }
}

function normalizeEntry(entry = {}) {
  const out = {
    phase: Number(entry.phase ?? 1),
    deadline_pages: Array.isArray(entry.deadline_pages)
      ? [...new Set(entry.deadline_pages.map(String))].sort()
      : [],
    last_checked: entry.last_checked ?? null,
    last_full_search: entry.last_full_search ?? null,
  }
  const leads = Array.isArray(entry.lead_pages) ? [...new Set(entry.lead_pages.map(String))].sort() : []
  if (leads.length) out.lead_pages = leads
  if (entry.note) out.note = String(entry.note)
  if (entry.evidence) out.evidence = String(entry.evidence)
  return out
}

function loadState(year, create = false) {
  const path = statePath(year)
  if (!existsSync(path)) {
    if (!create) die(`Missing research state: automation/research-state/${year}.json`)
    return { year: Number(year), conferences: {} }
  }
  const state = readJson(path)
  if (!state || Number(state.year) !== Number(year) || typeof state.conferences !== 'object') {
    die(`Invalid research state: ${path}`)
  }
  return state
}

function saveState(state) {
  mkdirSync(stateDir, { recursive: true })
  const conferences = {}
  // Plain code-point order: localeCompare varies by Node/ICU build, which would
  // reorder these files (and cause spurious diffs) depending on the machine.
  for (const name of Object.keys(state.conferences).sort()) {
    conferences[name] = normalizeEntry(state.conferences[name])
  }
  writeFileSync(
    statePath(state.year),
    JSON.stringify({ year: Number(state.year), conferences }, null, 2) + '\n',
  )
}

function rowMap() {
  return new Map(dataRows().map((c) => [`${c.name}\u0000${c.year}`, c]))
}

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

// Over means a past calendar year, or a known end_date that has passed.
function instanceOver(year, row, today) {
  return Number(year) < Number(today.slice(0, 4)) || Boolean(row?.end_date && row.end_date < today)
}

// Phase 4 drops a conference from the work queue for good. Before the instance
// is over, that needs an official source showing it will not be held.
function requireArchiveEvidence(year, name, evidence, note, today) {
  const row = rowMap().get(`${name}\u0000${year}`)
  if (instanceOver(year, row, today)) return false
  if (evidence && isHttpUrl(evidence) && note) return true
  die(`Refusing to move ${name} ${year} to phase 4.

Phase 4 removes it from the work queue permanently: no future run will look for
its dates or deadlines again. Use it only when an official source confirms that
${name} will not be held in ${year}.

If its details just aren't published yet, leave it in its current phase and run:
  node scripts/conference-state.mjs checked ${year} "${name}"

To archive it, pass that official source and the reason:
  node scripts/conference-state.mjs set ${year} "${name}" --phase 4 --evidence URL --note "not held in ${year}: ..."`)
}

function initialized(row) {
  return Boolean(row?.location && row?.start_date && row?.end_date && row?.link)
}

function syncOne(state, today) {
  const rows = rowMap()
  let changed = false

  for (const name of seedNames()) {
    if (!state.conferences[name]) {
      state.conferences[name] = blankEntry()
      changed = true
    }

    const entry = normalizeEntry(state.conferences[name])
    const row = rows.get(`${name}\u0000${state.year}`)
    const oldPhase = entry.phase

    // Phase 4 is terminal unless a maintainer explicitly moves it back.
    // A past calendar year is over, even for instances never found or not held.
    if (entry.phase !== 4) {
      if (instanceOver(state.year, row, today)) {
        entry.phase = 4
      } else if (!initialized(row)) {
        entry.phase = 1
      } else if (entry.deadline_pages.length) {
        entry.phase = 3
      } else {
        entry.phase = 2
      }
    }

    if (entry.phase !== oldPhase) changed = true
    state.conferences[name] = entry
  }

  return changed
}

function stateYears() {
  if (!existsSync(stateDir)) return []
  return readdirSync(stateDir)
    .map((name) => name.match(/^(\d{4})\.json$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)
}

function daysSince(date, today) {
  if (!date) return Infinity
  const a = Date.parse(date + 'T00:00:00Z')
  const b = Date.parse(today + 'T00:00:00Z')
  return Math.floor((b - a) / 86400000)
}

function due(entry, today) {
  return daysSince(entry.last_checked, today) >= WEEKLY_DAYS
}

function fullDue(entry, today) {
  return daysSince(entry.last_full_search, today) >= FULL_DAYS
}

const INIT_FIELDS = ['location', 'start_date', 'end_date', 'link']

// What earlier runs already found, so each run picks up where the last stopped.
function priorWork(row, entry) {
  const known = {}
  for (const field of INIT_FIELDS) if (row?.[field]) known[field] = row[field]
  return {
    known,
    missing: INIT_FIELDS.filter((field) => !row?.[field]),
    deadlines: row?.deadlines ?? [],
    deadline_pages: entry.deadline_pages,
    lead_pages: entry.lead_pages ?? [],
    note: entry.note ?? null,
    last_checked: entry.last_checked,
    last_full_search: entry.last_full_search,
  }
}

function todoItems(years, today) {
  const rows = rowMap()
  const items = []
  for (const year of years) {
    const state = loadState(year)
    for (const [name, raw] of Object.entries(state.conferences)) {
      const entry = normalizeEntry(raw)
      if (entry.phase === 4) continue
      const prior = priorWork(rows.get(`${name}\u0000${year}`), entry)

      if (entry.phase === 1 && due(entry, today)) {
        items.push({ year, name, phase: 1, action: 'initialize', ...prior })
      } else if (entry.phase === 2 && due(entry, today)) {
        items.push({ year, name, phase: 2, action: 'discover-deadlines', ...prior })
      } else if (entry.phase === 3 && (due(entry, today) || fullDue(entry, today))) {
        const full = fullDue(entry, today)
        items.push({ year, name, phase: 3, action: full ? 'full-deadline-check' : 'deadline-check', ...prior })
      }
    }
  }
  return items.sort((a, b) => a.phase - b.phase || a.year - b.year || a.name.localeCompare(b.name))
}

function printPriorWork(item) {
  const line = (label, value) => console.log(`        ${(label + ':').padEnd(15)}${value}`)
  if (item.phase === 1) {
    line('known', Object.entries(item.known).map(([k, v]) => `${k} ${v}`).join('; ') || 'nothing yet')
    line('missing', item.missing.join(', '))
  } else if (item.known.link) {
    line('homepage', item.known.link)
  }
  if (item.deadlines.length) line('deadlines', item.deadlines.map((d) => `${d.name} ${d.date}`).join('; '))
  for (const url of item.deadline_pages) line('deadline page', url)
  for (const url of item.lead_pages) line('lead page', url)
  if (item.note) line('note', item.note)
  const full = item.phase === 1 ? '' : `; last full search ${item.last_full_search ?? 'never'}`
  line('last checked', `${item.last_checked ?? 'never'}${full}`)
}

function printTodo(items) {
  const labels = {
    1: 'Phase 1 — initialization',
    2: 'Phase 2 — deadline discovery',
    3: 'Phase 3 — deadline checks',
  }
  for (const phase of [1, 2, 3]) {
    const group = items.filter((x) => x.phase === phase)
    if (!group.length) continue
    console.log(labels[phase])
    for (const item of group) {
      if (phase === 1) {
        console.log(`  ${item.year}  ${item.name} — fill in the missing fields from official sources`)
      } else if (phase === 2) {
        console.log(`  ${item.year}  ${item.name} — thoroughly discover official deadline/submission/registration pages`)
      } else {
        const kind = item.action === 'full-deadline-check' ? 'FULL monthly rediscovery + check' : 'weekly cached-page check'
        console.log(`  ${item.year}  ${item.name} — ${kind}`)
      }
      printPriorWork(item)
    }
    console.log('')
  }
  if (!items.length) console.log('No research items are due.')
}

// A misspelled name must fail loudly, not silently create a new tracked entry.
function requireEntry(state, name) {
  if (!state.conferences[name]) {
    die(`"${name}" is not tracked in ${state.year}.json; use the exact name shown by todo, or add it first`)
  }
  state.conferences[name] = normalizeEntry(state.conferences[name])
  return state.conferences[name]
}

function validateState(today) {
  const errors = []
  const expected = new Set(seedNames())
  const rows = rowMap()

  for (const year of stateYears()) {
    const state = loadState(year)
    for (const name of expected) {
      if (!state.conferences[name]) errors.push(`${year}: missing tracked conference "${name}"`)
    }

    for (const [name, raw] of Object.entries(state.conferences)) {
      const entry = normalizeEntry(raw)
      if (![1, 2, 3, 4].includes(entry.phase)) errors.push(`${year} ${name}: phase must be 1-4`)
      if (!Array.isArray(raw.deadline_pages)) errors.push(`${year} ${name}: deadline_pages must be an array`)
      if (raw.lead_pages != null && !Array.isArray(raw.lead_pages)) {
        errors.push(`${year} ${name}: lead_pages must be an array`)
      }
      for (const url of entry.lead_pages ?? []) {
        if (!isHttpUrl(url)) errors.push(`${year} ${name}: invalid lead page URL "${url}"`)
      }
      if (entry.phase === 3 && entry.deadline_pages.length === 0) {
        errors.push(`${year} ${name}: phase 3 requires at least one deadline_pages URL`)
      }
      for (const url of entry.deadline_pages) {
        if (!isHttpUrl(url)) errors.push(`${year} ${name}: invalid deadline page URL "${url}"`)
      }
      if (entry.evidence && !isHttpUrl(entry.evidence)) {
        errors.push(`${year} ${name}: invalid evidence URL "${entry.evidence}"`)
      }
      if (
        entry.phase === 4 &&
        !instanceOver(year, rows.get(`${name}\u0000${year}`), today) &&
        !(entry.evidence && entry.note)
      ) {
        errors.push(
          `${year} ${name}: phase 4 before the conference is over needs an official --evidence URL ` +
          'and a --note saying it will not be held; unpublished details belong in phase 1-3',
        )
      }
      for (const field of ['last_checked', 'last_full_search']) {
        if (entry[field] != null && !ISO_DATE.test(entry[field])) {
          errors.push(`${year} ${name}: ${field} must be YYYY-MM-DD or null`)
        }
      }
    }
  }

  if (errors.length) {
    console.error(`✗ ${errors.length} research-state validation error(s):`)
    for (const error of errors) console.error('  - ' + error)
    process.exit(1)
  }
  console.log(`✓ research state valid for ${stateYears().length} year file(s)`)
}

function usage() {
  console.log(`Conference research-state CLI

Commands:
  todo [--year YYYY] [--json] [--today YYYY-MM-DD]
  init-year YYYY [--force] [--today YYYY-MM-DD]
  sync [YYYY] [--today YYYY-MM-DD]   (no YYYY: also creates current/next year files)
  add YYYY "Conference name" [--phase 1|2|3]
  set YYYY "Conference name" --phase 1|2|3|4 [--note "..."] [--evidence URL]
  add-deadline-page YYYY "Conference name" URL
  remove-deadline-page YYYY "Conference name" URL
  add-lead-page YYYY "Conference name" URL      (phase 1: announcement, save-the-date)
  remove-lead-page YYYY "Conference name" URL
  checked YYYY "Conference name" [--full] [--date YYYY-MM-DD]
  show YYYY "Conference name"
  validate [--today YYYY-MM-DD]

Phases:
  1 initialization       Find and record official year page, location, and dates;
                         save partial finds as lead pages.
  2 deadline discovery   Thoroughly discover official deadline pages and deadlines.
  3 deadline monitoring  Recheck cached deadline_pages; monthly runs also rediscover.
  4 complete/archive     No routine research; omitted from todo. Before the
                         conference is over, requires --evidence and --note.
`)
}

const [command, ...args] = process.argv.slice(2)

if (!command || ['help', '--help', '-h'].includes(command)) {
  usage()
  process.exit(0)
}

if (command === 'validate') {
  validateState(todayFrom(args))
  process.exit(0)
}

if (command === 'todo') {
  const today = todayFrom(args)
  const requested = option(args, '--year')
  const years = requested ? [Number(requested)] : stateYears()
  const items = todoItems(years, today)
  if (has(args, '--json')) console.log(JSON.stringify(items, null, 2))
  else printTodo(items)
  process.exit(0)
}

if (command === 'init-year') {
  const year = Number(args[0])
  if (!Number.isInteger(year)) die('init-year requires a numeric year')
  const path = statePath(year)
  if (existsSync(path) && !has(args, '--force')) die(`${year}.json already exists; pass --force to rebuild it`)
  const state = { year, conferences: {} }
  for (const name of seedNames()) state.conferences[name] = blankEntry()
  syncOne(state, todayFrom(args))
  saveState(state)
  console.log(`Initialized automation/research-state/${year}.json`)
  process.exit(0)
}

if (command === 'sync') {
  const today = todayFrom(args)
  const explicitYear = args[0] && /^\d{4}$/.test(args[0]) ? Number(args[0]) : null
  // Without an explicit year, always cover the current and next calendar year,
  // creating their state files on first use (e.g. the first run in January).
  const thisYear = Number(today.slice(0, 4))
  const years = explicitYear
    ? [explicitYear]
    : [...new Set([...stateYears(), thisYear, thisYear + 1])].sort((a, b) => a - b)
  for (const year of years) {
    const state = loadState(year, !explicitYear)
    syncOne(state, today)
    saveState(state)
    console.log(`Synced ${year}`)
  }
  process.exit(0)
}

if (command === 'add') {
  const year = Number(args[0])
  const name = args[1]
  if (!Number.isInteger(year) || !name) die('add requires YEAR and conference name')
  const state = loadState(year)
  if (state.conferences[name]) die(`${name} already exists in ${year}.json`)
  const phase = Number(option(args, '--phase') ?? 1)
  if (![1, 2, 3].includes(phase)) die('--phase must be 1, 2, or 3; archive with set --phase 4')
  state.conferences[name] = blankEntry(phase)
  saveState(state)
  console.log(`Added ${name} to ${year} phase ${phase}`)
  process.exit(0)
}

if (command === 'set') {
  const year = Number(args[0])
  const name = args[1]
  const phase = Number(option(args, '--phase'))
  if (!Number.isInteger(year) || !name || ![1, 2, 3, 4].includes(phase)) {
    die('set requires YEAR, conference name, and --phase 1|2|3|4')
  }
  const state = loadState(year)
  const entry = requireEntry(state, name)
  const note = option(args, '--note')
  const evidence = option(args, '--evidence')
  const early = phase === 4 && requireArchiveEvidence(year, name, evidence, note ?? entry.note, todayFrom(args))
  entry.phase = phase
  if (note != null) entry.note = note
  if (phase === 4 && evidence) entry.evidence = evidence
  if (phase !== 4) delete entry.evidence
  saveState(state)
  console.log(`Set ${name} ${year} to phase ${phase}`)
  if (early) {
    console.warn(`WARNING: ${name} ${year} has left the work queue for good; no future run will research it.`)
    console.warn(`Recorded evidence that it will not be held: ${evidence}`)
  }
  process.exit(0)
}

const PAGE_COMMANDS = ['add-deadline-page', 'remove-deadline-page', 'add-lead-page', 'remove-lead-page']

if (PAGE_COMMANDS.includes(command)) {
  const year = Number(args[0])
  const name = args[1]
  const url = args[2]
  if (!Number.isInteger(year) || !name || !url) die(`${command} requires YEAR, conference name, and URL`)
  if (!isHttpUrl(url)) die(`Invalid URL: ${url}`)
  const state = loadState(year)
  const entry = requireEntry(state, name)
  const adding = command.startsWith('add-')
  const kind = command.endsWith('lead-page') ? 'lead' : 'deadline'
  const field = `${kind}_pages`
  const pages = entry[field] ?? []
  entry[field] = adding ? [...new Set([...pages, url])].sort() : pages.filter((x) => x !== url)
  // Only deadline pages drive phases; lead pages are notes for the next run.
  if (kind === 'deadline') {
    if (adding && entry.phase !== 4) entry.phase = 3
    if (!adding && entry.phase === 3 && entry.deadline_pages.length === 0) entry.phase = 2
  }
  saveState(state)
  console.log(`${adding ? 'Added' : 'Removed'} ${kind} page for ${name} ${year}`)
  process.exit(0)
}

if (command === 'checked') {
  const year = Number(args[0])
  const name = args[1]
  const date = option(args, '--date') ?? new Date().toISOString().slice(0, 10)
  if (!Number.isInteger(year) || !name || !ISO_DATE.test(date)) {
    die('checked requires YEAR, conference name, and optional --date YYYY-MM-DD')
  }
  const state = loadState(year)
  const entry = requireEntry(state, name)
  entry.last_checked = date
  if (has(args, '--full')) entry.last_full_search = date
  saveState(state)
  console.log(`Marked ${name} ${year} checked on ${date}${has(args, '--full') ? ' (full)' : ''}`)
  process.exit(0)
}

if (command === 'show') {
  const year = Number(args[0])
  const name = args[1]
  if (!Number.isInteger(year) || !name) die('show requires YEAR and conference name')
  const state = loadState(year)
  const entry = state.conferences[name]
  if (!entry) die(`${name} not found in ${year}.json`)
  console.log(JSON.stringify({ year, name, ...normalizeEntry(entry) }, null, 2))
  process.exit(0)
}

die(`Unknown command: ${command}. Run with --help.`)

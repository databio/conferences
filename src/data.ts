// Data layer: the bundled conferences.json is the source of truth. It is
// imported at build time (embedded in the Worker), normalized once, and served
// from memory. No database, no runtime fetch.

import raw from '../data/conferences.json'

/** A dated milestone for a conference (abstract deadline, proceedings, etc.). */
export interface ConferenceDeadline {
  name: string // human label, e.g. "Abstracts", "Proceedings", "Late posters"
  date: string // ISO YYYY-MM-DD
}

/** A conference instance as stored in the curated file. */
export interface RawConference {
  name: string
  full_name?: string
  year: number
  location?: string
  start_date?: string
  end_date?: string
  link?: string
  deadlines?: ConferenceDeadline[]
  note?: string
  attending?: boolean
}

/** A normalized instance: raw fields plus a derived stable identity. */
export interface Conference extends RawConference {
  slug: string // stable series id, e.g. "ismb", "recomb"
  id: string // `${slug}-${year}`, unique per instance
}

/** A flattened deadline row across all conferences — the `/deadlines` feed. */
export interface DeadlineRow {
  id: string // `${slug}-${year}:${kind-slug}`
  slug: string
  year: number
  conference: string // display name
  kind: string // milestone label ("Abstracts", or "Conference" for the event)
  date: string
  location?: string
  link?: string
}

/**
 * Derive a stable series slug from a conference name: take the part before the
 * first ':' or '(' , drop any 4-digit year, lowercase and hyphenate. Series
 * with drifting names (e.g. "useR" vs "useR!") collapse to one slug; genuinely
 * different spellings (e.g. "BioC" vs "Bioconductor") stay distinct until
 * curated. Promote curated slugs into the data file to override this later.
 */
export function slugifySeries(name: string): string {
  const base = name.split(/[:(]/)[0].replace(/\b20\d\d\b/g, '')
  return base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function slugifyKind(kind: string): string {
  return kind.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deadline'
}

// ── Normalize once at module load ────────────────────────────────────────────
const conferences: Conference[] = (raw as { conferences: RawConference[] }).conferences.map((c) => {
  const slug = slugifySeries(c.name)
  return { ...c, slug, id: `${slug}-${c.year}` }
})

const byId = new Map<string, Conference>(conferences.map((c) => [c.id, c]))

const bySlug = new Map<string, Conference[]>()
for (const c of conferences) {
  const list = bySlug.get(c.slug) ?? []
  list.push(c)
  bySlug.set(c.slug, list)
}
for (const list of bySlug.values()) list.sort((a, b) => b.year - a.year)

// Flat, date-sorted deadline rows: each explicit milestone plus a synthetic
// "Conference" row for the event start date.
const deadlineRows: DeadlineRow[] = []
for (const c of conferences) {
  const milestones: ConferenceDeadline[] = [...(c.deadlines ?? [])]
  if (c.start_date) milestones.push({ name: 'Conference', date: c.start_date })
  for (const m of milestones) {
    if (!m.date) continue
    deadlineRows.push({
      id: `${c.id}:${slugifyKind(m.name)}`,
      slug: c.slug,
      year: c.year,
      conference: c.name,
      kind: m.name,
      date: m.date,
      location: c.location,
      link: c.link,
    })
  }
}
deadlineRows.sort((a, b) => a.date.localeCompare(b.date))

// ── Public accessors ─────────────────────────────────────────────────────────
export function allConferences(): Conference[] {
  return conferences
}

export function series(slug: string): Conference[] | undefined {
  return bySlug.get(slug)
}

export function instance(slug: string, year: number): Conference | undefined {
  return byId.get(`${slug}-${year}`)
}

export function allDeadlines(): DeadlineRow[] {
  return deadlineRows
}

export function lastUpdated(): string {
  // Newest date present in the dataset — a cheap freshness signal.
  let max = ''
  for (const c of conferences) {
    for (const d of [c.start_date, c.end_date, ...(c.deadlines ?? []).map((x) => x.date)]) {
      if (d && d > max) max = d
    }
  }
  return max
}

export interface ConferenceFilter {
  year?: number
  from?: string
  to?: string
  location?: string
  q?: string
  upcoming?: boolean
  today?: string // injected "today" (workers have no stable clock at import)
}

export function filterConferences(f: ConferenceFilter): Conference[] {
  return conferences.filter((c) => {
    if (f.year && c.year !== f.year) return false
    if (f.from && (c.start_date ?? '') < f.from) return false
    if (f.to && (c.start_date ?? '') > f.to) return false
    if (f.location && !(c.location ?? '').toLowerCase().includes(f.location.toLowerCase())) return false
    if (f.upcoming && f.today && (c.end_date ?? c.start_date ?? '') < f.today) return false
    if (f.q) {
      const hay = `${c.name} ${c.full_name ?? ''} ${c.location ?? ''}`.toLowerCase()
      if (!hay.includes(f.q.toLowerCase())) return false
    }
    return true
  })
}

export interface DeadlineFilter {
  from?: string
  to?: string
  kind?: string
  days?: number
  today?: string
}

export function filterDeadlines(f: DeadlineFilter): DeadlineRow[] {
  const to = f.days != null && f.today ? addDays(f.today, f.days) : f.to
  return deadlineRows.filter((d) => {
    if (f.from && d.date < f.from) return false
    if (to && d.date > to) return false
    if (f.kind && d.kind.toLowerCase() !== f.kind.toLowerCase()) return false
    return true
  })
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

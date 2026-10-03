// Deadliner provider contract v2 for conferences.databio.org.
// The consumer appends `/deadlines...` to base_url, so base_url
// `https://conferences.databio.org/api/v1` reaches these handlers. Read-only:
// no per-user state, so capabilities are ["read", "pool"]. One Item per
// conference instance (source_ref = `<slug>-<year>`), carrying every milestone
// as a date. Items must match deadliner's item schema exactly
// (test/fixtures/item.schema.json, vendored from deadliner).
import { allConferences, displayTitle, milestones, type Conference } from './data'

export interface ItemDate { kind: string; label: string; date: string }

export interface ConferenceItem {
  source: 'conferences'
  source_ref: string
  title: string
  type: 'conference'
  status: null
  status_options: null
  subscribed: false
  url: string | null
  owner: null
  notes: null
  ref_slug: null
  dates: ItemDate[]
}

export function toItem(c: Conference): ConferenceItem | null {
  const dates = milestones(c)
    .map(({ kind, label, date }) => ({ kind, label, date }))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (dates.length === 0) return null
  return {
    source: 'conferences',
    source_ref: c.id,
    title: displayTitle(c),
    type: 'conference',
    status: null,
    status_options: null,
    subscribed: false,
    url: c.link ?? null,
    owner: null,
    notes: null,
    ref_slug: null,
    dates,
  }
}

export interface ProviderQuery { scope?: string; from?: string; to?: string }

const inWindow = (d: ItemDate, q: ProviderQuery) =>
  (!q.from || d.date >= q.from) && (!q.to || d.date <= q.to)

/** `scope=mine` is empty (nothing is subscribed here). pool/all: every conference
 *  with at least one date in the window, carrying all its dates. */
export function providerItems(q: ProviderQuery): ConferenceItem[] {
  if (q.scope === 'mine') return []
  const items: ConferenceItem[] = []
  for (const c of allConferences()) {
    const item = toItem(c)
    if (item && item.dates.some((d) => inWindow(d, q))) items.push(item)
  }
  const first = (i: ConferenceItem) => (i.dates.find((d) => inWindow(d, q)) ?? i.dates[0]).date
  return items.sort((a, b) => first(a).localeCompare(first(b)))
}

export const providerCapabilities = { name: 'conferences', capabilities: ['read', 'pool'] as const }

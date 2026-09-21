// DeadlineProvider contract surface for the databio deadline-aggregator.
// The aggregator appends `/deadlines...` to a provider's base_url, so pointing
// it at `https://conferences.databio.org/api/v1` reaches these handlers. This
// is READ-ONLY: conferences.databio.org holds no per-user state, so there is no
// subscribe/status — capabilities are just ["read","pool"]. Rows conform to the
// aggregator's canonical Deadline model (extra="forbid": exactly these fields).
import { allDeadlines, type DeadlineRow } from './data'

export interface CanonicalDeadline {
  source: string
  source_ref: string
  kind: string
  id: string
  title: string
  date: string
  type: 'conference'
  status: string | null
  subscribed: boolean | null
  url: string | null
  owner: string | null
  notes: string | null
  ref_slug: string | null
}

function toCanonical(r: DeadlineRow): CanonicalDeadline {
  // r.id is `${slug}-${year}:${kindSlug}` — use it as source_ref; kind is its suffix.
  const kind = r.id.slice(r.id.lastIndexOf(':') + 1)
  return {
    source: 'conferences',
    source_ref: r.id,
    kind,
    id: `conferences:${r.id}:${kind}`,
    title: `${r.conference} ${r.year}`,
    date: r.date,
    type: 'conference',
    status: null,
    subscribed: false,
    url: r.link ?? null,
    owner: null,
    notes: null,
    ref_slug: null,
  }
}

export interface ProviderQuery {
  scope?: string // mine | pool | all
  from?: string
  to?: string
}

/** Canonical deadline rows for the aggregator. `scope=mine` is empty (nothing is
 *  subscribed here); pool/all return every conference deadline in the window. */
export function providerDeadlines(q: ProviderQuery): CanonicalDeadline[] {
  if (q.scope === 'mine') return []
  return allDeadlines()
    .filter((r) => (!q.from || r.date >= q.from) && (!q.to || r.date <= q.to))
    .map(toCanonical)
}

export const providerCapabilities = { name: 'conferences', capabilities: ['read', 'pool'] as const }

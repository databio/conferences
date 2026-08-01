// conferences.databio.org — a stateless, git-backed, AI-curated conference +
// deadline API. All reads are served from the bundled dataset at the edge;
// corrections are GitHub PRs. See README.md.
import {
  allConferences,
  allDeadlines,
  filterConferences,
  filterDeadlines,
  instance,
  coverageThrough,
  series,
  slugifySeries,
  type Conference,
  type DeadlineRow,
} from './data'
import { toICal } from './ical'
import { landingHtml } from './landing'
import { openapi } from './openapi'
import schema from '../schema.json'

interface Env {
  GITHUB_REPO?: string
}

const RESERVED = new Set([
  '',
  'conferences',
  'conferences.json',
  'conferences.csv',
  'deadlines',
  'calendar.ics',
  'topics',
  'stats',
  'schema.json',
  'openapi.json',
  'llms.txt',
  'suggest',
  'health',
  'favicon.ico',
  'robots.txt',
])

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  })
}

function text(body: string, contentType: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': contentType, ...CORS, ...extra } })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const url = new URL(request.url)
    const qp = url.searchParams
    const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)
    const head = segments[0] ?? ''

    // ── POST /suggest — stateless correction path (returns a prefilled PR/issue) ──
    if (request.method === 'POST' && head === 'suggest') return handleSuggest(request, env)
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405)

    // ── Utility / reserved endpoints ──────────────────────────────────────────
    if (segments.length === 0) return landing(env)
    if (segments.length === 1 && RESERVED.has(head)) {
      switch (head) {
        case 'health':
          return json({ ok: true })
        case 'conferences':
          return json(applyConfFilters(qp))
        case 'conferences.json':
          return json(allConferences())
        case 'conferences.csv':
          return text(toCsv(allConferences()), 'text/csv; charset=utf-8')
        case 'deadlines':
          return json(applyDeadlineFilters(qp))
        case 'calendar.ics':
          return text(
            toICal(applyDeadlineFilters(qp), 'Conference deadlines'),
            'text/calendar; charset=utf-8',
            200,
            { 'Content-Disposition': 'inline; filename="conferences.ics"' },
          )
        case 'topics':
          return json([]) // controlled vocabulary — to be curated into the data
        case 'stats':
          return json({
            conferences: allConferences().length,
            series: new Set(allConferences().map((c) => c.slug)).size,
            deadlines: allDeadlines().length,
            coverage_through: coverageThrough(),
          })
        case 'schema.json':
          return json(schema)
        case 'openapi.json':
          return json(openapi)
        case 'llms.txt':
          return text(llmsTxt(env), 'text/plain; charset=utf-8')
        case 'robots.txt':
          return text('User-agent: *\nAllow: /\n', 'text/plain; charset=utf-8')
        case 'favicon.ico':
          return new Response(null, { status: 204 })
      }
    }

    // ── Conference resources: /{slug}, /{slug}/{year}, /{slug}/{year}/{sub} ─────
    const slug = head
    if (segments.length === 1) {
      const s = series(slug)
      return s ? json(s) : json({ error: `unknown conference series: ${slug}` }, 404)
    }
    const year = Number(segments[1])
    if (!Number.isInteger(year)) return json({ error: 'year must be an integer' }, 400)
    const inst = instance(slug, year)
    if (!inst) return json({ error: `no ${slug} in ${year}` }, 404)

    if (segments.length === 2) return json(inst)
    if (segments.length === 3) {
      const rows = instanceDeadlines(inst)
      if (segments[2] === 'deadlines') return json(rows)
      if (segments[2] === 'calendar.ics') {
        return text(toICal(rows, `${inst.name} ${year}`), 'text/calendar; charset=utf-8')
      }
    }
    return json({ error: 'not found' }, 404)
  },
}

function applyConfFilters(qp: URLSearchParams): Conference[] {
  const yr = qp.get('year')
  return filterConferences({
    year: yr ? Number(yr) : undefined,
    from: qp.get('from') ?? undefined,
    to: qp.get('to') ?? undefined,
    location: qp.get('location') ?? undefined,
    q: qp.get('q') ?? undefined,
    upcoming: qp.get('upcoming') === 'true',
    today: today(),
  })
}

function applyDeadlineFilters(qp: URLSearchParams): DeadlineRow[] {
  const days = qp.get('days')
  return filterDeadlines({
    from: qp.get('from') ?? undefined,
    to: qp.get('to') ?? undefined,
    kind: qp.get('kind') ?? undefined,
    days: days ? Number(days) : undefined,
    today: today(),
  })
}

function instanceDeadlines(inst: Conference): DeadlineRow[] {
  return allDeadlines().filter((d) => d.id.startsWith(`${inst.id}:`))
}

function toCsv(rows: Conference[]): string {
  const cols = ['slug', 'name', 'full_name', 'year', 'location', 'start_date', 'end_date', 'link']
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [cols.join(',')]
  for (const r of rows) lines.push(cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))
  return lines.join('\n') + '\n'
}

async function handleSuggest(request: Request, env: Env): Promise<Response> {
  // Stateless v0: validate the shape and hand back a prefilled GitHub issue URL.
  // (A later iteration can open a PR directly with a GITHUB_TOKEN secret.)
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'body must be JSON' }, 400)
  }
  if (typeof body.name !== 'string' || typeof body.year !== 'number') {
    return json({ error: 'a suggestion needs at least { name: string, year: number }' }, 422)
  }
  const repo = env.GITHUB_REPO ?? 'databio/conferences'
  const title = encodeURIComponent(`Conference: ${body.name} ${body.year}`)
  const suggested = { ...body, slug: slugifySeries(body.name as string) }
  const bodyText = encodeURIComponent(
    'Proposed addition/correction (edit `data/conferences.json`):\n\n```json\n' +
      JSON.stringify(suggested, null, 2) +
      '\n```',
  )
  const issue_url = `https://github.com/${repo}/issues/new?title=${title}&body=${bodyText}`
  return json({ ok: true, issue_url, note: 'Open the link to submit as a GitHub issue; a maintainer turns it into a PR.' }, 201)
}

function landing(env: Env): Response {
  return text(landingHtml(env.GITHUB_REPO ?? 'databio/conferences'), 'text/html; charset=utf-8')
}

function llmsTxt(env: Env): string {
  const repo = env.GITHUB_REPO ?? 'databio/conferences'
  return `# conferences.databio.org

An AI-curated, git-backed API of computational-biology conferences and deadlines.
Read-only JSON. Base URL: https://conferences.databio.org

## How to query
- GET /conferences?year=2026&topic=&from=&to=&q=  -> list of instances
- GET /deadlines?days=90&kind=abstract           -> upcoming deadlines, date-sorted
- GET /{slug}            -> a conference series (all years), e.g. /ismb
- GET /{slug}/{year}     -> one instance, e.g. /recomb/2027
- GET /calendar.ics      -> subscribable calendar
- GET /openapi.json      -> full machine-readable spec
- GET /schema.json       -> record schema

## Corrections
Data lives in ${repo} at data/conferences.json. Open a PR, or POST /suggest
{name, year, ...} to get a prefilled issue link. Do not scrape; use the API.
`
}

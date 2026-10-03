import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import schema from './fixtures/item.schema.json'
import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { slugifySeries, allConferences, allDeadlines, displayTitle, milestones, type Conference } from '../src/data'
import type { ConferenceItem } from '../src/provider'

const validate = addFormats(new Ajv({ allErrors: true })).compile(schema)

const env = { GITHUB_REPO: 'databio/conferences' }
const get = (path: string) => worker.fetch(new Request(`https://conferences.databio.org${path}`), env as never)

describe('slug derivation', () => {
  it('strips year and subtitle, collapses drift', () => {
    expect(slugifySeries('BioC 2021: Where Software and Biology Connect')).toBe('bioc')
    expect(slugifySeries('ISMB')).toBe('ismb')
    expect(slugifySeries('useR!')).toBe('user')
    expect(slugifySeries('useR')).toBe('user')
    expect(slugifySeries('BOSC (ISMB)')).toBe('bosc')
    expect(slugifySeries('CSH Genome Informatics')).toBe('csh-genome-informatics')
  })
})

describe('data invariants', () => {
  it('every conference has a slug and unique id', () => {
    const ids = allConferences().map((c) => c.id)
    expect(ids.length).toBeGreaterThan(50)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('deadline feed is date-sorted', () => {
    const rows = allDeadlines()
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].date <= rows[i].date).toBe(true)
  })
})

describe('read endpoints', () => {
  it('GET /health', async () => {
    const r = await get('/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })
  it('GET / renders a human table + AI section', async () => {
    const r = await get('/')
    expect(r.headers.get('content-type')).toContain('text/html')
    const html = await r.text()
    expect(html).toContain('<table>')
    expect(html).toContain('For AI agents')
    expect(html).toContain('automation/update-conferences.md')
  })
  it('GET / has SEO title, meta, og tags, and valid JSON-LD', async () => {
    const html = await (await get('/')).text()
    expect(html).toContain('<title>Computational Biology Conferences List and API</title>')
    expect(html).toContain('<meta name="description"')
    expect(html).toContain('<link rel="canonical" href="https://conferences.databio.org/">')
    expect(html).toContain('<meta name="robots" content="index,follow">')
    expect(html).toContain('<meta property="og:title"')
    expect(html).toContain('<meta property="og:site_name" content="databio">')
    expect(html).toContain('<meta name="twitter:card" content="summary">')
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    expect(m).toBeTruthy()
    const ld = JSON.parse(m![1]) as { '@type': string; itemListElement: unknown[] }
    expect(ld['@type']).toBe('ItemList')
    expect(Array.isArray(ld.itemListElement)).toBe(true)
  })
  it('GET /robots.txt advertises the sitemap', async () => {
    const r = await get('/robots.txt')
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('Sitemap: https://conferences.databio.org/sitemap.xml')
  })
  it('GET /sitemap.xml lists the homepage', async () => {
    const r = await get('/sitemap.xml')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toContain('xml')
    const xml = await r.text()
    expect(xml).toContain('<loc>https://conferences.databio.org/</loc>')
  })
  it('GET /conferences returns an array', async () => {
    const r = await get('/conferences')
    expect(r.status).toBe(200)
    expect(Array.isArray(await r.json())).toBe(true)
  })
  it('GET /conferences?year= filters', async () => {
    const r = await get('/conferences?year=2026')
    const rows = (await r.json()) as { year: number }[]
    expect(rows.every((c) => c.year === 2026)).toBe(true)
  })
  it('GET /deadlines?days= returns only the next N days (no past dates)', async () => {
    const r = await get('/deadlines?days=3650')
    const rows = (await r.json()) as { date: string }[]
    const today = new Date().toISOString().slice(0, 10)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((d) => d.date >= today)).toBe(true)
  })
  it('GET /{slug} returns the series', async () => {
    const r = await get('/ismb')
    expect(r.status).toBe(200)
    const rows = (await r.json()) as { slug: string }[]
    expect(rows.every((c) => c.slug === 'ismb')).toBe(true)
  })
  it('GET /{slug}/{year} returns one instance or 404', async () => {
    const series = (await (await get('/ismb')).json()) as { year: number }[]
    const yr = series[0].year
    const r = await get(`/ismb/${yr}`)
    expect(r.status).toBe(200)
    const bad = await get('/ismb/1900')
    expect(bad.status).toBe(404)
  })
  it('GET /calendar.ics returns a VCALENDAR', async () => {
    const r = await get('/calendar.ics')
    expect(r.headers.get('content-type')).toContain('text/calendar')
    expect(await r.text()).toContain('BEGIN:VCALENDAR')
  })
  it('GET /stats + /schema.json + /openapi.json', async () => {
    expect((await (await get('/stats')).json())).toHaveProperty('coverage_through')
    expect((await (await get('/schema.json')).json())).toHaveProperty('title', 'Conference')
    expect((await (await get('/openapi.json')).json())).toHaveProperty('openapi')
  })
  it('unknown series 404s', async () => {
    expect((await get('/not-a-real-conf')).status).toBe(404)
  })
})

describe('deadliner provider contract v2 (/api/v1/deadlines)', () => {
  const pool = async (qs = '') =>
    (await (await get(`/api/v1/deadlines?scope=pool${qs}`)).json()) as ConferenceItem[]

  it('capabilities is read-only', async () => {
    const r = await get('/api/v1/deadlines/capabilities')
    expect(await r.json()).toEqual({ name: 'conferences', capabilities: ['read', 'pool'] })
  })
  it('pool items validate against the vendored item schema', async () => {
    const items = await pool()
    expect(items.length).toBeGreaterThan(0)
    for (const it of items) {
      if (!validate(it)) expect.fail(JSON.stringify(validate.errors, null, 2))
      expect(it.source).toBe('conferences')
      expect(it.type).toBe('conference')
      expect(it.source_ref).toMatch(/^[a-z0-9-]+-\d{4}$/)
    }
    const refs = items.map((i) => i.source_ref)
    expect(new Set(refs).size).toBe(refs.length)
    const byRef = new Map(allConferences().map((c) => [c.id, c]))
    for (const it of items) {
      if (byRef.get(it.source_ref)?.start_date) {
        expect(it.dates.some((d) => d.kind === 'conference' && d.label === 'Conference')).toBe(true)
      }
    }
  })
  const rich = () =>
    allConferences().find((c) => (c.deadlines ?? []).filter((d) => d.date).length >= 2 && c.start_date)!
  it('groups all milestones of an instance into one item', async () => {
    const c = rich()
    const item = (await pool()).find((i) => i.source_ref === c.id)!
    const named = (c.deadlines ?? []).filter((d) => d.date)
    expect(item.dates.length).toBe(named.length + 1)
    expect(item.dates.map((d) => d.date)).toEqual([...item.dates.map((d) => d.date)].sort())
    for (const d of named) expect(item.dates.map((x) => x.label)).toContain(d.name)
  })
  it('window returns the item with all its dates', async () => {
    const c = rich()
    const target = c.deadlines!.find((d) => d.date)!.date
    const items = await pool(`&from=${target}&to=${target}`)
    const item = items.find((i) => i.source_ref === c.id)!
    expect(item).toBeTruthy()
    expect(item.dates.length).toBeGreaterThan(1)
  })
  it('title keeps names containing the year, appends otherwise', async () => {
    const items = await pool()
    for (const c of allConferences()) {
      const item = items.find((i) => i.source_ref === c.id)
      if (!item) continue
      expect(item.title).toBe(c.name.includes(String(c.year)) ? c.name : `${c.name} ${c.year}`)
    }
    expect(displayTitle({ name: 'BioC 2021: X', year: 2021 } as Conference)).toBe('BioC 2021: X')
    expect(displayTitle({ name: 'ISMB', year: 2027 } as Conference)).toBe('ISMB 2027')
  })
  it('scope=mine is empty; bad scope and dates are 400', async () => {
    expect(await (await get('/api/v1/deadlines?scope=mine')).json()).toEqual([])
    expect((await get('/api/v1/deadlines?scope=bogus')).status).toBe(400)
    expect((await get('/api/v1/deadlines?from=nope')).status).toBe(400)
  })
  it('milestones(): first of a duplicate kind wins', () => {
    const c = { name: 'X', year: 2027, slug: 'x', id: 'x-2027', start_date: '2027-09-01',
      deadlines: [{ name: 'Abstract', date: '2027-01-01' }, { name: 'abstract!', date: '2027-02-01' }] } as Conference
    expect(milestones(c)).toEqual([
      { kind: 'abstract', label: 'Abstract', date: '2027-01-01' },
      { kind: 'conference', label: 'Conference', date: '2027-09-01' },
    ])
  })
})

describe('POST /suggest', () => {
  it('returns a prefilled issue url', async () => {
    const r = await worker.fetch(
      new Request('https://conferences.databio.org/suggest', {
        method: 'POST',
        body: JSON.stringify({ name: 'NeurIPS', year: 2027 }),
      }),
      env as never,
    )
    expect(r.status).toBe(201)
    const body = (await r.json()) as { issue_url: string }
    expect(body.issue_url).toContain('github.com/databio/conferences/issues/new')
  })
  it('422 on a bad suggestion', async () => {
    const r = await worker.fetch(
      new Request('https://conferences.databio.org/suggest', { method: 'POST', body: '{}' }),
      env as never,
    )
    expect(r.status).toBe(422)
  })
})

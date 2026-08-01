// Server-rendered human view of the dataset: conferences grouped by year in a
// table (Conference · Dates · Location · Deadlines), a year-count nav, and an
// "AI + contribute" section pointing at the skill / API / PR flow. Generated
// from the bundled data — no client JS.
import type { Conference } from './data'
import { allConferences } from './data'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

function dateRange(start?: string, end?: string): string {
  if (!start) return '—'
  if (!end || end === start) return monthDay(start)
  const [, sm, sd] = start.split('-').map(Number)
  const [, em, ed] = end.split('-').map(Number)
  return sm === em ? `${MONTHS[sm - 1]} ${sd}–${ed}` : `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`
}

function deadlinesCell(c: Conference): string {
  if (!c.deadlines?.length) return '—'
  return c.deadlines
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => `${esc(d.name)} <span class="d-date">${monthDay(d.date)}</span>`)
    .join(' &middot; ')
}

function nameCell(c: Conference): string {
  const label = esc(c.name)
  const inner = c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">${label}</a>` : label
  const full = c.full_name ? `<span class="full">${esc(c.full_name)}</span>` : ''
  return `${inner}${full}`
}

const SITE = 'https://conferences.databio.org'

// schema.org ItemList of Event objects for dated, current+future conferences.
// Serialized as JSON, then `<` is escaped to < so the payload can never
// break out of the surrounding <script> element.
function jsonLd(confs: Conference[], currentYear: number): string {
  const events = confs
    .filter((c) => c.start_date && c.year >= currentYear)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
    .map((c, i) => {
      const event: Record<string, unknown> = {
        '@type': 'Event',
        name: c.full_name ? `${c.name} (${c.full_name})` : c.name,
        startDate: c.start_date,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      }
      if (c.end_date) event.endDate = c.end_date
      if (c.link) event.url = c.link
      if (c.location) event.location = { '@type': 'Place', name: c.location }
      return { '@type': 'ListItem', position: i + 1, item: event }
    })
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Computational Biology Conferences and Deadlines',
    description: 'Upcoming computational biology, bioinformatics, and genomics conferences with dates and submission deadlines.',
    url: `${SITE}/`,
    numberOfItems: events.length,
    itemListElement: events,
  }
  return JSON.stringify(doc).replace(/</g, '\\u003c')
}

export function landingHtml(repo: string): string {
  const confs = allConferences()
  const byYear = new Map<number, Conference[]>()
  for (const c of confs) {
    const list = byYear.get(c.year) ?? []
    list.push(c)
    byYear.set(c.year, list)
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)
  for (const y of years) byYear.get(y)!.sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))

  const nav = [`<a href="#top">All ${confs.length}</a>`, ...years.map((y) => `<a href="#y${y}">${y} <b>${byYear.get(y)!.length}</b></a>`)].join('')

  const sections = years
    .map((y) => {
      const rows = byYear
        .get(y)!
        .map(
          (c) => `<tr>
        <td class="c-name">${nameCell(c)}</td>
        <td class="c-dates">${dateRange(c.start_date, c.end_date)}${
          c.start_date
            ? ` <a class="cal" href="/${c.slug}/${c.year}/calendar.ics" title="Add ${esc(c.name)} ${c.year} (and its deadlines) to your calendar">📅</a>`
            : ''
        }</td>
        <td class="c-loc">${esc(c.location ?? '')}</td>
        <td class="c-dl">${deadlinesCell(c)}</td>
      </tr>`,
        )
        .join('')
      return `<h2 id="y${y}">${y}</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>Conference</th><th>Dates</th><th>Location</th><th>Deadlines</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
    })
    .join('')

  const skillUrl = `https://github.com/${repo}/blob/main/.claude/skills/update-conferences/SKILL.md`
  const contribUrl = `https://github.com/${repo}/blob/main/CONTRIBUTING.md`

  const currentYear = new Date().getUTCFullYear()
  const description =
    'Curated computational biology, bioinformatics, and genomics conference dates and submission deadlines. Browse by year, subscribe via iCal, or query the open JSON API.'
  const ld = jsonLd(confs, currentYear)

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Computational Biology Conferences List and API</title>
<meta name="description" content="${esc(description)}">
<meta name="keywords" content="computational biology conferences, bioinformatics conferences, genomics conferences, conference deadlines, abstract submission deadlines, conference calendar, iCal, conference API">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${SITE}/">
<meta property="og:type" content="website">
<meta property="og:title" content="Computational Biology Conferences List and API">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}/">
<meta property="og:site_name" content="databio">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Computational Biology Conferences List and API">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${ld}</script>
<style>
  :root { --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb; --accent:#2563eb; --bg:#fff; }
  @media (prefers-color-scheme: dark){ :root{ --fg:#e5e7eb; --muted:#9ca3af; --line:#2b2f36; --accent:#60a5fa; --bg:#0d1117; } }
  * { box-sizing:border-box; }
  body { font:16px/1.55 system-ui,-apple-system,sans-serif; color:var(--fg); background:var(--bg); margin:0; }
  main { max-width:60rem; margin:0 auto; padding:2rem 1rem 4rem; }
  h1 { margin:0 0 .25rem; font-size:1.9rem; }
  .sub { color:var(--muted); margin:0 0 1rem; }
  .links a { color:var(--accent); text-decoration:none; margin-right:1rem; font-size:.9rem; }
  .links a:hover { text-decoration:underline; }
  nav.years { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line); padding:.6rem 0; margin:1rem 0; display:flex; flex-wrap:wrap; gap:.25rem 1rem; font-size:.85rem; }
  nav.years a { color:var(--fg); text-decoration:none; }
  nav.years a:hover { color:var(--accent); }
  nav.years b { color:var(--muted); font-weight:600; }
  h2 { margin:1.8rem 0 .5rem; font-size:1.2rem; border-bottom:2px solid var(--accent); display:inline-block; padding-bottom:2px; }
  .tablewrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:.92rem; }
  th { text-align:left; color:var(--muted); font-weight:600; font-size:.78rem; text-transform:uppercase; letter-spacing:.03em; padding:.4rem .6rem; border-bottom:1px solid var(--line); }
  td { padding:.5rem .6rem; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:hover td { background:color-mix(in srgb, var(--accent) 6%, transparent); }
  .c-name a { color:var(--fg); font-weight:600; text-decoration:none; }
  .c-name a:hover { color:var(--accent); }
  .c-name .full { display:block; color:var(--muted); font-size:.8rem; font-weight:400; }
  .c-dates, .c-dl { white-space:nowrap; }
  .c-dl { font-size:.85rem; }
  .d-date { color:var(--muted); }
  .cal { text-decoration:none; font-size:.85em; opacity:.5; margin-left:.15rem; }
  .cal:hover { opacity:1; }
  .ai { margin-top:2.5rem; border:1px solid var(--line); border-radius:10px; padding:1rem 1.25rem; background:color-mix(in srgb, var(--accent) 4%, transparent); }
  .ai h2 { border:0; display:block; margin:.2rem 0 .5rem; }
  .ai code { background:color-mix(in srgb, var(--fg) 8%, transparent); padding:.1em .35em; border-radius:4px; font-size:.85em; }
  .ai ul { margin:.4rem 0; padding-left:1.2rem; }
  footer { margin-top:2rem; color:var(--muted); font-size:.82rem; }
</style></head>
<body><main id="top">
  <h1>Computational Biology Conferences &amp; Deadlines</h1>
  <p class="sub">Curated dates and submission deadlines for computational biology, bioinformatics, and genomics conferences — AI-curated, with an open API.</p>
  <p class="links">
    <a href="/conferences">API</a>
    <a href="/deadlines?days=180">Upcoming deadlines</a>
    <a href="/calendar.ics">Subscribe (iCal)</a>
    <a href="https://github.com/${repo}" target="_blank" rel="noopener">GitHub</a>
  </p>

  <nav class="years">${nav}</nav>

  ${sections}

  <section class="ai">
    <h2>For AI agents &amp; contributors</h2>
    <p>This list is a <strong>git-backed, AI-curated dataset</strong>. Don't scrape the page — use the API, and propose changes as pull requests.</p>
    <ul>
      <li><strong>Query it:</strong> <a href="/llms.txt">/llms.txt</a> (how to use it) and <a href="/openapi.json">/openapi.json</a> (full spec). Base URL <code>https://conferences.databio.org</code>.</li>
      <li><strong>Propose a change (AI or human):</strong> edit <code>data/conferences.json</code> and open a PR — see <a href="${contribUrl}" target="_blank" rel="noopener">CONTRIBUTING</a>. Or <code>POST /suggest</code> <code>{name, year}</code> for a prefilled issue link.</li>
      <li><strong>How the agent maintains it:</strong> <a href="${skillUrl}" target="_blank" rel="noopener">update-conferences SKILL.md</a> — the instructions a weekly AI agent follows to research and update the list.</li>
    </ul>
  </section>

  <footer>
    ${confs.length} conferences across ${years.length} years · data CC-BY-4.0 · <a href="https://github.com/${repo}">${repo}</a>
  </footer>
</main></body></html>`
}

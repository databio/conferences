// Minimal RFC 5545 iCalendar output. All-day VEVENTs (deadlines) show as date
// markers; a conference itself is a multi-day all-day event over its range.
import type { Conference, DeadlineRow } from './data'

function esc(s: string): string {
  return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
}

function compact(iso: string): string {
  return iso.replace(/-/g, '')
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

interface Event {
  uid: string
  start: string // ISO date
  end?: string // ISO date, inclusive; DTEND is the day after
  summary: string
  url?: string
  location?: string
}

function vevent(e: Event): string[] {
  const endExclusive = nextDay(e.end && e.end >= e.start ? e.end : e.start)
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}@conferences.databio.org`,
    `DTSTAMP:${compact(e.start)}T000000Z`,
    `DTSTART;VALUE=DATE:${compact(e.start)}`,
    `DTEND;VALUE=DATE:${compact(endExclusive)}`,
    `SUMMARY:${esc(e.summary)}`,
    e.url ? `URL:${esc(e.url)}` : '',
    e.location ? `LOCATION:${esc(e.location)}` : '',
    'END:VEVENT',
  ].filter(Boolean)
}

function wrap(name: string, events: string[][]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//databio//conferences.databio.org//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    ...events.flat(),
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n'
}

/** A calendar of deadline rows (the flat feed). Each is an all-day marker. */
export function toICal(rows: DeadlineRow[], name = 'Conference deadlines'): string {
  return wrap(
    name,
    rows.map((r) =>
      vevent({ uid: r.id, start: r.date, summary: `${r.conference} — ${r.kind}`, url: r.link, location: r.location }),
    ),
  )
}

/** A single conference: a multi-day event over its dates, plus its deadlines. */
export function toICalConference(c: Conference): string {
  const events: string[][] = []
  if (c.start_date) {
    events.push(
      vevent({
        uid: `${c.id}:conference`,
        start: c.start_date,
        end: c.end_date,
        summary: c.name,
        url: c.link,
        location: c.location,
      }),
    )
  }
  for (const d of c.deadlines ?? []) {
    events.push(
      vevent({
        uid: `${c.id}:${d.name}`,
        start: d.date,
        summary: `${c.name} — deadline: ${d.name}`,
        url: c.link,
        location: c.location,
      }),
    )
  }
  return wrap(`${c.name} ${c.year}`, events)
}

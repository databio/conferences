// Minimal RFC 5545 iCalendar output for deadline rows. All-day VEVENTs so they
// show as date markers in Google/Apple Calendar.
import type { DeadlineRow } from './data'

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

export function toICal(rows: DeadlineRow[], name = 'Conference deadlines'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//databio//conferences.databio.org//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
  ]
  for (const r of rows) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@conferences.databio.org`,
      `DTSTAMP:${compact(r.date)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(r.date)}`,
      // All-day events are half-open: DTEND is the day after DTSTART.
      `DTEND;VALUE=DATE:${compact(nextDay(r.date))}`,
      `SUMMARY:${esc(`${r.conference} — ${r.kind}`)}`,
      r.link ? `URL:${esc(r.link)}` : '',
      r.location ? `LOCATION:${esc(r.location)}` : '',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n') + '\r\n'
}

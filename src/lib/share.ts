import { fmtDay, fmtMonth, parse } from './dates'
import type { Player, Session, Stats, Status, Mark } from './types'
import { FOLLOW_UP } from './types'

interface Src {
  clubName: string
  activePlayers: Player[]
  sessions: Session[]
  marks: Record<string, Record<string, Mark>>
  dayMarks: (date: string) => Record<string, Mark>
  isRequired: (date: string) => boolean
  statsFor: (id: string) => Stats
}

const list = (ps: Player[]) => ps.map((p) => p.name).join(', ')

export function sessionSummary(st: Src, date: string): string {
  const day = st.dayMarks(date)
  const by = (k: Status) => st.activePlayers.filter((p) => day[p.id]?.status === k)
  const P = by('P'), L = by('L'), E = by('E'), A = by('A')
  const unmarked = st.activePlayers.filter((p) => !day[p.id])
  const lines = [
    `${st.clubName}`,
    `${fmtDay(date)} · ${st.isRequired(date) ? 'Training day' : 'Normal day'}`,
    `On court: ${P.length + L.length}/${st.activePlayers.length}`,
  ]
  if (L.length) lines.push(`Late (${L.length}): ${list(L)}`)
  if (E.length) lines.push(`Excused (${E.length}): ${list(E)}`)
  if (A.length) lines.push(`Absent (${A.length}): ${list(A)}`)
  if (unmarked.length) lines.push(`Not marked (${unmarked.length}): ${list(unmarked)}`)
  return lines.join('\n')
}

/** Month report from sessions in that month (YYYY-MM). */
export function monthReport(st: Src, month: string): string {
  const inMonth = st.sessions.filter((s) => s.date.startsWith(month) && Object.keys(st.marks[s.id] || {}).length)
  const train = inMonth.filter((s) => s.required)
  const normal = inMonth.filter((s) => !s.required)
  const pctFor = (sessions: Session[], pid: string) => {
    let came = 0, counted = 0
    for (const s of sessions) {
      const m = st.marks[s.id]?.[pid]
      if (!m || m.status === 'E') continue
      counted++
      if (m.status === 'P' || m.status === 'L') came++
    }
    return counted ? Math.round((came / counted) * 100) : null
  }
  const rows = st.activePlayers.map((p) => ({ p, t: pctFor(train, p.id), n: pctFor(normal, p.id) }))
  const avg = (vals: (number | null)[]) => { const v = vals.filter((x): x is number => x !== null); return v.length ? `${Math.round(v.reduce((a, b) => a + b, 0) / v.length)}%` : 'n/a' }
  const perfect = rows.filter((r) => r.t === 100).map((r) => r.p)
  const low = rows.filter((r) => r.t !== null && r.t < FOLLOW_UP).sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
  const topNormal = rows.filter((r) => r.n !== null && r.n > 0).sort((a, b) => (b.n ?? 0) - (a.n ?? 0)).slice(0, 5)

  const title = fmtMonth(`${month}-01`)
  const lines = [`${st.clubName}: ${title} attendance`, '']
  lines.push(`Training days: ${train.length} session${train.length === 1 ? '' : 's'} · squad average ${avg(rows.map((r) => r.t))}`)
  lines.push(`Normal days: ${normal.length} session${normal.length === 1 ? '' : 's'} · squad average ${avg(rows.map((r) => r.n))}`)
  if (perfect.length) lines.push('', `100% at training (${perfect.length}): ${list(perfect)}`)
  if (topNormal.length) lines.push('', `Most normal-day sessions: ${topNormal.map((r) => `${r.p.name} ${r.n}%`).join(', ')}`)
  if (low.length) lines.push('', `Below ${FOLLOW_UP}% at training: ${low.map((r) => `${r.p.name} ${r.t}%`).join(', ')}`)
  return lines.join('\n')
}

export function monthsWithData(sessions: Session[]): string[] {
  const set = new Set(sessions.map((s) => s.date.slice(0, 7)))
  return [...set].sort().reverse()
}

export function shareToTelegram(text: string, url = location.origin) {
  const href = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  window.open(href, '_blank', 'noopener')
}

export function monthLabel(month: string) {
  return parse(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

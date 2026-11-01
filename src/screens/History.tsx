import { useState } from 'react'
import { useStore } from '../lib/store'
import { fmtDay, fmtMonth, fmtShort, today } from '../lib/dates'
import { DAY_LONG, DAY_SHORT, STATUSES, type Status } from '../lib/types'
import { ConfirmButton, Icon, Sheet } from '../components/ui'
import { supabase } from '../lib/supabase'
import { monthLabel, monthReport, monthsWithData } from '../lib/share'
import { ShareSheet } from './Today'
import { go } from '../router'
import { disablePush, enablePush, isNative, pushAvailable, pushIsOn } from '../lib/push'

export function History({ email }: { email: string }) {
  const st = useStore()
  const held = st.sessions.filter((s) => st.players.some((p) => { const m = st.effectiveMark(s, p); return m && !m.pending }))
  const months = monthsWithData(held)
  const [picked, setMonth] = useState('')
  const month = picked && months.includes(picked) ? picked : months[0] ?? ''
  const [reportOpen, setReportOpen] = useState(false)
  const [clubName, setClubName] = useState(st.clubName)
  const total = st.activePlayers.length
  const done = held

  const counts = (sid: string) => {
    const c: Record<Status, number> = { P: 0, L: 0, E: 0, A: 0 }
    const s = st.sessions.find((x) => x.id === sid)!
    for (const p of st.activePlayers) { const m = st.effectiveMark(s, p); if (m && !m.pending) c[m.status]++ }
    return c
  }

  const trend = done.filter((s) => s.required).slice(-10).map((s) => { const c = counts(s.id); return { s, came: c.P + c.L, size: c.P + c.L + c.E + c.A } })
  const maxSize = Math.max(total, ...trend.map((t) => t.size), 1)
  const avg = trend.length ? (trend.reduce((a, t) => a + t.came, 0) / trend.length).toFixed(1) : null

  const groups: { month: string; items: typeof done }[] = []
  for (const s of [...done].reverse()) {
    const m = fmtMonth(s.date)
    const g = groups[groups.length - 1]
    if (g && g.month === m) g.items.push(s)
    else groups.push({ month: m, items: [s] })
  }

  function exportCsv() {
    const q = (x: string | number) => { const v = String(x); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }
    const head = ['Player', 'Number', 'Position', ...done.map((s) => `${s.date} ${s.required ? 'Training day' : 'Normal day'}`),
      'Training P', 'Training L', 'Training E', 'Training A', 'Training %',
      'Normal P', 'Normal L', 'Normal E', 'Normal A', 'Normal %']
    const rows = st.players.map((p) => {
      const s = st.statsFor(p.id)
      const n = s.normal
      return [p.name, p.number ?? '', p.position ?? '', ...done.map((x) => { const m = st.effectiveMark(x, p); return m ? (m.auto ? 'A (no check-in)' : m.pending ? `${m.status} (needs OK)` : m.status) : '' }),
        s.P, s.L, s.E, s.A, s.pct ?? '', n.P, n.L, n.E, n.A, n.pct ?? '']
    })
    const csv = [head, ...rows].map((r) => r.map(q).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `rollcall-attendance-${today()}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <div className="screen">
      <header className="page-head">
        <div className="row-between">
          <h1>History</h1>
          <button type="button" className="pill-btn outline" onClick={exportCsv} disabled={!st.players.length}><Icon.download /> Export CSV</button>
        </div>
        {trend.length > 1 && (
          <section className="trend" aria-label="Turnout trend">
            <div className="row-between">
              <span className="eyebrow accent">Turnout · last {trend.length}</span>
              <span className="trend-avg">avg {avg} of {total}</span>
            </div>
            <div className="bars" style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0, 1fr))` }}>
              {trend.map((t, i) => (
                <button key={t.s.id} type="button" className={`bar${i === trend.length - 1 ? ' last' : ''}`} style={{ height: `${Math.max(4, (t.came / maxSize) * 100)}%` }}
                  aria-label={`${fmtDay(t.s.date)}: ${t.came} came`} onClick={() => go('today', t.s.date)} />
              ))}
            </div>
            <div className="row-between trend-axis"><span>{fmtShort(trend[0].s.date)}</span><span>{fmtShort(trend[trend.length - 1].s.date)}</span></div>
          </section>
        )}
      </header>

      <main className="body">
        {groups.length === 0 ? (
          <section className="empty">
            <Icon.ball size={40} />
            <h2>No sessions yet</h2>
            <p>Each session you mark on the Today tab shows up here.</p>
            <button type="button" className="btn primary" onClick={() => go('today')}>Take attendance</button>
          </section>
        ) : groups.map((g) => (
          <section key={g.month} className="stack-8">
            <span className="eyebrow">{g.month}</span>
            <ul className="card list">
              {g.items.map((s) => {
                const c = counts(s.id)
                const size = Math.max(total, c.P + c.L + c.E + c.A, 1)
                return (
                  <li key={s.id}>
                    <button type="button" className="hist-row" onClick={() => go('today', s.date)}>
                      <span className="row-between">
                        <span className="who-text"><span className="name">{fmtDay(s.date)}</span><span className="sub">{s.kind !== 'Training' ? s.kind : ''}<span className={`tag${s.required ? ' train' : ''}`}>{s.required ? 'Training day' : 'Normal day'}</span></span></span>
                        <span className="hist-n">{c.P + c.L}<small> / {total}</small></span>
                      </span>
                      <span className="stackbar thin" aria-hidden="true">
                        {STATUSES.map((k) => c[k] ? <i key={k} className={`s-${k}`} style={{ width: `${(c[k] / size) * 100}%` }} /> : null)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {months.length > 0 && (
          <section className="card pad stack-12 account">
            <h2 className="h-label">Monthly report</h2>
            <p className="sub">A summary for the club group: averages, perfect attendance and who needs a follow-up.</p>
            <div className="row-2">
              <select id="report-month" className="select" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Report month">
                {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
              <button type="button" className="btn primary" onClick={() => setReportOpen(true)}><Icon.send /> Share</button>
            </div>
          </section>
        )}

        {st.club.role === 'owner' && (
          <section className="card pad stack-12">
            <h2 className="h-label">Training days</h2>
            <p className="sub">Sessions on these days go into the training-day %. Every other day goes into the normal-day %.</p>
            <div className="days" role="group" aria-label="Training days">
              {DAY_SHORT.map((d, i) => {
                const on = st.trainingDays.includes(i)
                return (
                  <button key={d} type="button" className={`day${on ? ' on' : ''}`} aria-pressed={on} aria-label={DAY_LONG[i]}
                    onClick={() => st.setTrainingDays(on ? st.trainingDays.filter((x) => x !== i) : [...st.trainingDays, i])}>{d}</button>
                )
              })}
            </div>
            <p className="sub">Changing this affects new sessions. Use the session type on Today to change one you already recorded.</p>
            <form className="row-2 club-name" onSubmit={(e) => { e.preventDefault(); st.setClubName(clubName) }}>
              <label className="field"><span>Club name (used in Telegram messages)</span>
                <input id="club-name" maxLength={60} value={clubName} onChange={(e) => setClubName(e.target.value)} />
              </label>
              <button type="submit" className="btn" disabled={!clubName.trim() || clubName.trim() === st.clubName}>Save</button>
            </form>
          </section>
        )}

        <NotifyCard email={email} />

        {st.club.role === 'owner' && <CourtCard />}

        {st.club.role === 'owner' && <CoachesCard />}

        <section className="card pad stack-12">
          <h2 className="h-label">Account</h2>
          <p className="sub">
            Signed in as {email}.{' '}
            {st.club.role === 'owner' ? 'Your club data syncs across your devices.' : `You’re a ${st.club.role === 'editor' ? 'coach who can mark attendance' : 'view-only coach'} for ${st.clubName}.`}
          </p>
          <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title={`${monthLabel(month || '2026-01')} report`}>
        {reportOpen && <ShareSheet text={monthReport(st, month)} />}
      </Sheet>
    </div>
  )
}

function NotifyCard({ email }: { email: string }) {
  const st = useStore()
  const [on, setOn] = useState(pushIsOn())
  const [busy, setBusy] = useState(false)
  void email
  return (
    <section className="card pad stack-12">
      <h2 className="h-label">Check-in notifications</h2>
      {!isNative && <p className="sub">Install the Rollcall Android app to get a notification each time a player scans in at the court.</p>}
      {isNative && !pushAvailable && <p className="sub">Notifications aren’t switched on in this build yet. They arrive in the next app update.</p>}
      {pushAvailable && (
        <label className="toggle-row">
          <span className="who-text">
            <span className="name">Notify me when players check in</span>
            <span className="sub">Including check-ins that need your OK.</span>
          </span>
          <input id="push-toggle" type="checkbox" role="switch" checked={on} disabled={busy} onChange={async (e) => {
            setBusy(true)
            try {
              if (e.target.checked) {
                const sessionUser = (await supabase.auth.getUser()).data.user
                const ok = sessionUser ? await enablePush(sessionUser.id, st.club.owner) : false
                setOn(ok)
                st.notify(ok ? 'Notifications on' : 'Allow notifications for Rollcall in your phone settings')
              } else { await disablePush(); setOn(false); st.notify('Notifications off') }
            } catch (err) { st.notify(`Couldn’t turn on notifications: ${(err as Error)?.message ?? err}`) }
            setBusy(false)
          }} />
        </label>
      )}
    </section>
  )
}

function CourtCard() {
  const st = useStore()
  const c = st.court
  const [start, setStart] = useState(c.start)
  const [end, setEnd] = useState(c.end)
  const [late, setLate] = useState(c.late ?? '')
  const [radius, setRadius] = useState(c.radius)
  const [locating, setLocating] = useState(false)
  const dirty = start !== c.start || end !== c.end || (late || null) !== c.late || radius !== c.radius

  function saveHere() {
    if (!('geolocation' in navigator)) { st.notify('This phone can’t share its location.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      setLocating(false)
      const ok = await st.saveCourt({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      if (ok) st.notify(`Court location saved (accurate to about ${Math.round(pos.coords.accuracy)} m)`)
    }, () => { setLocating(false); st.notify('Location blocked. Allow location for this site in your browser settings.') },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }

  return (
    <section className="card pad stack-12">
      <h2 className="h-label">Court check-in</h2>
      <p className="sub">Print the poster once and put it at the court. Players scan it during check-in hours, and it only works when they’re at the court.</p>
      <p className={`court-status ${c.lat ? 'ok' : 'warn'}`}>
        <Icon.qr />
        {c.lat ? `Court location saved · players must be within ${c.radius} m` : 'Court location not saved yet. Until it is, every check-in waits for your OK.'}
      </p>
      <button type="button" className="btn" disabled={locating} onClick={saveHere}>
        {locating ? 'Finding your location…' : c.lat ? 'Update court location (stand on the court)' : 'Save court location (stand on the court)'}
      </button>
      <form className="stack-12" onSubmit={async (e) => {
        e.preventDefault()
        if (end <= start) { st.notify('Closing time must be after opening time'); return }
        if (await st.saveCourt({ start, end, late: late || null, radius })) st.notify('Check-in times saved')
      }}>
        <div className="times">
          <label className="field"><span>Opens</span><input id="ci-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field"><span>Closes</span><input id="ci-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          <label className="field"><span>Late after</span><input id="ci-late" type="time" value={late} onChange={(e) => setLate(e.target.value)} /></label>
        </div>
        <label className="field"><span>How close to the court</span>
          <select id="ci-radius" className="select" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {[80, 150, 250, 400].map((r) => <option key={r} value={r}>{r} m{r === 150 ? ' (recommended)' : ''}</option>)}
          </select>
        </label>
        {dirty && <button type="submit" className="btn primary">Save times</button>}
      </form>
      <div className="row-2">
        <button type="button" className="btn primary" onClick={() => go('poster')}>Open poster</button>
        <ConfirmButton className="btn" label="New QR code" confirm="Tap again: old poster stops" onConfirm={() => st.newCourtCode()} />
      </div>
    </section>
  )
}

function CoachesCard() {
  const st = useStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)
  return (
    <section className="card pad stack-12">
      <h2 className="h-label">Coaches</h2>
      <p className="sub">Give the President or another coach access from their own phone. They create a Rollcall account, you invite their email, and they accept in their app.</p>
      {st.invites.length > 0 && (
        <ul className="coach-list">
          {st.invites.map((i) => (
            <li key={i.coach}>
              <span className="who-text"><span className="name">{i.coach_email}</span><span className="sub">{i.status === 'declined' ? 'Declined your invite' : 'Invite sent, waiting for them to accept'}</span></span>
            </li>
          ))}
        </ul>
      )}
      {st.coaches.length > 0 && (
        <ul className="coach-list">
          {st.coaches.map((c) => (
            <li key={c.coach}>
              <span className="who-text"><span className="name">{c.coach_email}</span><span className="sub">{c.role === 'editor' ? 'Can mark attendance' : 'View only'}</span></span>
              <ConfirmButton className="link danger" label="Remove" confirm="Tap again" onConfirm={() => st.removeCoach(c.coach)} />
            </li>
          ))}
        </ul>
      )}
      <form className="stack-12" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true)
        const ok = await st.addCoach(email, role)
        setBusy(false)
        if (ok) setEmail('')
      }}>
        <label className="field"><span>Their email</span>
          <input id="coach-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="president@example.com" />
        </label>
        <div className="chips" role="group" aria-label="Access level">
          <button type="button" className={`chip${role === 'editor' ? ' on' : ''}`} aria-pressed={role === 'editor'} onClick={() => setRole('editor')}>Can mark attendance</button>
          <button type="button" className={`chip${role === 'viewer' ? ' on' : ''}`} aria-pressed={role === 'viewer'} onClick={() => setRole('viewer')}>View only</button>
        </div>
        <button type="submit" className="btn primary" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send invite'}</button>
      </form>
    </section>
  )
}

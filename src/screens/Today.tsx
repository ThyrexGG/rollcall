import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../lib/store'
import { currentTrainingDay, fmtDay, stepTrainingDay, today, weekday } from '../lib/dates'
import { DAY_LONG, SESSION_KINDS, STATUSES, STATUS_LABEL, type Player, type Status } from '../lib/types'
import { ConfirmButton, Icon, Jersey, Sheet } from '../components/ui'
import { sessionSummary, shareToTelegram } from '../lib/share'
import { go } from '../router'

export function Today({ date, setDate }: { date: string; setDate: (d: string) => void }) {
  const st = useStore()
  const session = st.sessionFor(date)
  const day = st.dayMarks(date)
  const roster = st.activePlayers
  const n: Record<Status, number> = { P: 0, L: 0, E: 0, A: 0 }
  roster.forEach((p) => { const m = day[p.id]; if (m) n[m.status]++ })
  const total = roster.length
  const marked = n.P + n.L + n.E + n.A
  const isToday = date === today()
  const required = st.isRequired(date)
  const days = st.trainingDays
  const todayIsTraining = days.includes(weekday(today()))
  const homeDay = currentTrainingDay(days)
  const [focus, setFocus] = useState<Player | null>(null)
  const [kindOpen, setKindOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [q, setQ] = useState('')
  const [unmarkedOnly, setUnmarkedOnly] = useState(false)
  const checkinOpen = !!(session?.checkin_code && session.checkin_until && new Date(session.checkin_until) > new Date())

  // while check-in is open, refresh every few seconds so self check-ins appear
  useEffect(() => {
    if (!checkinOpen) return
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') st.reload() }, 5000)
    return () => window.clearInterval(t)
  }, [checkinOpen, st.reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return roster.filter((p) => (!term || p.name.toLowerCase().includes(term) || (p.number ?? '') === term) && (!unmarkedOnly || !day[p.id]))
  }, [roster, q, unmarkedOnly, day])

  return (
    <div className="screen">
      <header className={`hero${required ? '' : ' optional'}`}>
        <div className="hero-nav">
          <button className="icon-btn" type="button" aria-label="Previous training day" onClick={() => setDate(stepTrainingDay(date, days, -1))}><Icon.back /></button>
          <div className="hero-date">
            <button type="button" className="kind-chip" onClick={() => st.canEdit && setKindOpen(true)}>
              {[required ? 'Training day' : 'Normal day', session && session.kind !== 'Training' ? session.kind : null, isToday ? 'Today' : null].filter(Boolean).join(' · ')}
            </button>
            <label className="date-pick">
              <span className="date-big">{fmtDay(date)}</span>
              <input type="date" value={date} aria-label="Pick a date" onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          </div>
          <button className="icon-btn" type="button" aria-label="Next training day" onClick={() => setDate(stepTrainingDay(date, days, 1))}><Icon.next /></button>
        </div>

        <div className="turnout">
          <div className="turnout-num">
            <span className="big">{n.P + n.L}</span>
            <span className="of">/ {total}</span>
          </div>
          <span className="turnout-cap">
            on court
            <br />
            {total - marked ? `${total - marked} still to mark` : total ? 'all marked' : ''}
          </span>
        </div>
        <div className="stackbar" aria-hidden="true">
          {STATUSES.map((k) => n[k] ? <i key={k} className={`s-${k}`} style={{ width: `${(n[k] / Math.max(total, 1)) * 100}%` }} /> : null)}
        </div>
        <div className="legend">
          {STATUSES.map((k) => <span key={k}><i className={`s-${k}`} />{n[k]} {STATUS_LABEL[k].toLowerCase()}</span>)}
        </div>
        {!required && (
          <p className="optional-note">Normal-day session. It counts toward the normal-day %, kept separate from training-day %.</p>
        )}
        {total > 0 && (
          <div className="hero-actions">
            {st.canEdit && (
              <button type="button" className={`hero-btn${checkinOpen ? ' live' : ''}`} onClick={() => setQrOpen(true)}>
                <Icon.qr /> {checkinOpen ? 'Check-in open' : 'QR check-in'}
              </button>
            )}
            <button type="button" className="hero-btn" onClick={() => setShareOpen(true)} disabled={!marked}><Icon.send /> Share</button>
          </div>
        )}
        <div className="hero-links">
          {date !== homeDay && (
            <button type="button" className="link on-dark" onClick={() => setDate(homeDay)}>
              {todayIsTraining ? 'Back to today' : `Back to ${DAY_LONG[weekday(homeDay)]}’s training`}
            </button>
          )}
          {!todayIsTraining && !isToday && (
            <button type="button" className="link on-dark" onClick={() => setDate(today())}>Record today (normal day)</button>
          )}
        </div>
      </header>

      <main className="body">
        {total === 0 ? (
          <section className="empty">
            <Icon.ball size={40} />
            <h2>{st.canEdit ? 'Add your squad first' : 'No players yet'}</h2>
            <p>Once players are in, taking attendance is one tap per player.</p>
            {st.canEdit && <button type="button" className="btn primary" onClick={() => go('squad', 'add')}>Add players</button>}
          </section>
        ) : (
          <>
            {!st.canEdit && <p className="banner info" role="status">You have view-only access. Ask the club owner for marking access.</p>}
            <div className="toolbar">
              <label className="search">
                <Icon.search />
                <input id="roster-search" type="search" placeholder={`Search ${total} players`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
              </label>
              <button type="button" className={`chip${unmarkedOnly ? ' on' : ''}`} aria-pressed={unmarkedOnly} onClick={() => setUnmarkedOnly((v) => !v)}>
                Unmarked {total - marked}
              </button>
            </div>
            {st.canEdit && marked < total && (
              <div className="row-between">
                <span className="eyebrow">Fill the rest</span>
                <div className="row-gap">
                  {!required && <button type="button" className="pill-btn" onClick={() => st.markRest(date, 'A')}>Rest absent</button>}
                  <button type="button" className="pill-btn accent" onClick={() => st.markRest(date, 'P')}>Rest present</button>
                </div>
              </div>
            )}
            {shown.length === 0 ? (
              <p className="hint center-text">{unmarkedOnly && !q ? 'Everyone is marked.' : `No player matches “${q}”.`}</p>
            ) : (
              <ul className="card list">
                {shown.map((p) => {
                  const m = day[p.id]
                  const s = st.statsFor(p.id)
                  const pct = (t: number | null) => (t === null ? '–' : `${t}%`)
                  return (
                    <li key={p.id} className="mark-row">
                      <button type="button" className="who" onClick={() => setFocus(p)}>
                        <Jersey p={p} />
                        <span className="who-text">
                          <span className="name">{p.name}</span>
                          <span className="sub">
                            {[p.position, `Training ${pct(s.pct)}`, `Normal ${pct(s.normal.pct)}`].filter(Boolean).join(' · ')}
                            {m?.self ? <span className="tag self">QR</span> : null}
                            {m?.note ? <> · <Icon.note /></> : null}
                          </span>
                        </span>
                      </button>
                      <div className="seg" role="group" aria-label={`${p.name} attendance`}>
                        {STATUSES.map((k) => (
                          <button
                            key={k}
                            type="button"
                            className={`seg-b s-${k}${m?.status === k ? ' on' : ''}`}
                            aria-pressed={m?.status === k}
                            aria-label={STATUS_LABEL[k]}
                            title={STATUS_LABEL[k]}
                            disabled={!st.canEdit}
                            onClick={() => st.setMark(date, p.id, m?.status === k ? null : k)}
                          >{k}</button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="hint">P present · L late · E excused · A absent. Tap again to unmark. Tap a name to add a note.</p>
            {session && st.canEdit && (
              <div className="center">
                <ConfirmButton className="link danger" label="Clear this session" confirm="Tap again to clear every mark" onConfirm={() => st.deleteSession(date)} />
              </div>
            )}
          </>
        )}
      </main>

      <Sheet open={!!focus} onClose={() => setFocus(null)} title={focus ? focus.name : ''}>
        {focus && <MarkSheet key={focus.id + date} p={focus} date={date} close={() => setFocus(null)} />}
      </Sheet>

      <Sheet open={kindOpen} onClose={() => setKindOpen(false)} title="Session type">
        <label className="toggle-row">
          <span className="who-text">
            <span className="name">Training day</span>
            <span className="sub">On for {days.map((d) => DAY_LONG[d]).join(' and ') || 'no days'} by default. Off makes it a normal day, tracked in the normal-day %.</span>
          </span>
          <input id="required-toggle" type="checkbox" role="switch" checked={required} onChange={(e) => st.setRequired(date, e.target.checked)} />
        </label>
        <div className="choice-grid">
          {SESSION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`choice${(session?.kind ?? 'Training') === k ? ' on' : ''}`}
              onClick={() => { st.setKind(date, k); setKindOpen(false) }}
            >{k}</button>
          ))}
        </div>
      </Sheet>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="QR check-in">
        {qrOpen && <CheckinSheet date={date} />}
      </Sheet>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share to Telegram">
        {shareOpen && <ShareSheet text={sessionSummary(st, date)} />}
      </Sheet>
    </div>
  )
}

function MarkSheet({ p, date, close }: { p: Player; date: string; close: () => void }) {
  const st = useStore()
  const m = st.dayMarks(date)[p.id]
  const [note, setNote] = useState(m?.note ?? '')
  return (
    <div className="stack-16">
      <p className="sheet-sub">{fmtDay(date)}{p.number ? ` · #${p.number}` : ''}{p.position ? ` · ${p.position}` : ''}{m?.self ? ' · checked in by QR' : ''}</p>
      <div className="seg big" role="group" aria-label="Attendance">
        {STATUSES.map((k) => (
          <button key={k} type="button" className={`seg-b s-${k}${m?.status === k ? ' on' : ''}`} aria-pressed={m?.status === k} disabled={!st.canEdit}
            onClick={() => st.setMark(date, p.id, m?.status === k ? null : k)}>{STATUS_LABEL[k]}</button>
        ))}
      </div>
      <label className="field">
        <span>Note for this session</span>
        <textarea id={`note-${p.id}`} rows={3} maxLength={280} value={note} placeholder="e.g. Exam week, back Friday" disabled={!m || !st.canEdit}
          onChange={(e) => setNote(e.target.value)} />
        {!m && <small>Mark attendance first to add a note.</small>}
      </label>
      <div className="row-2">
        <button type="button" className="btn" onClick={() => { close(); go('player', p.id) }}>View profile</button>
        <button type="button" className="btn primary" disabled={!m || !st.canEdit} onClick={() => { st.setNote(date, p.id, note); close() }}>Save note</button>
      </div>
    </div>
  )
}

function CheckinSheet({ date }: { date: string }) {
  const st = useStore()
  const s = st.sessionFor(date)
  const open = !!(s?.checkin_code && s.checkin_until && new Date(s.checkin_until) > new Date())
  const [late, setLate] = useState(s?.late_after?.slice(0, 5) ?? '18:10')
  const [useLate, setUseLate] = useState(s ? s.late_after !== null : true)
  const [svg, setSvg] = useState('')
  const [busy, setBusy] = useState(false)
  const url = open && s ? `${location.origin}/#checkin-${s.checkin_code}` : ''

  useEffect(() => {
    if (!url) { setSvg(''); return }
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0E1E33', light: '#FFFFFF' } }).then(setSvg)
  }, [url])

  const day = st.dayMarks(date)
  const selfCount = Object.values(day).filter((m) => m.self).length

  if (!open) {
    return (
      <div className="stack-16">
        <p className="sheet-sub">Players scan a code at the court and tap their own name. You still see and can change every mark.</p>
        <label className="toggle-row">
          <span className="who-text">
            <span className="name">Mark late after a time</span>
            <span className="sub">Check-ins after this time are marked L instead of P.</span>
          </span>
          <input id="use-late" type="checkbox" role="switch" checked={useLate} onChange={(e) => setUseLate(e.target.checked)} />
        </label>
        {useLate && (
          <label className="field">
            <span>Late after</span>
            <input id="late-after" type="time" value={late} onChange={(e) => setLate(e.target.value)} />
          </label>
        )}
        <button type="button" className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await st.openCheckin(date, useLate && late ? late : null); setBusy(false) }}>
          {busy ? 'Opening…' : `Open check-in for ${fmtDay(date)}`}
        </button>
        <p className="hint">Check-in stays open for 4 hours, or until you close it.</p>
      </div>
    )
  }

  return (
    <div className="stack-16 qr-wrap">
      <div className="qr" role="img" aria-label="Check-in QR code" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="qr-meta">
        <strong>{selfCount}</strong> checked in by QR{s?.late_after ? ` · late after ${s.late_after.slice(0, 5)}` : ''}
        <br />Open until {new Date(s!.checkin_until!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <div className="row-2">
        <button type="button" className="btn" onClick={async () => {
          try { await navigator.clipboard.writeText(url); st.notify('Link copied') } catch { st.notify(url) }
        }}>Copy link</button>
        <button type="button" className="btn" onClick={() => shareToTelegram(`Check in for ${fmtDay(date)} training: tap your name.`, url)}>Send in Telegram</button>
      </div>
      <ConfirmButton className="btn danger-outline" label="Close check-in" confirm="Tap again to close" onConfirm={() => st.closeCheckin(date)} />
    </div>
  )
}

export function ShareSheet({ text }: { text: string }) {
  const st = useStore()
  return (
    <div className="stack-16">
      <pre className="share-preview">{text}</pre>
      <div className="row-2">
        <button type="button" className="btn" onClick={async () => {
          try { await navigator.clipboard.writeText(text); st.notify('Copied. Paste it in the group.') } catch { st.notify('Copy blocked. Select the text above.') }
        }}>Copy text</button>
        <button type="button" className="btn primary" onClick={() => shareToTelegram(text)}><Icon.send /> Telegram</button>
      </div>
      <p className="hint">Telegram opens with the message ready. Pick the club group and send.</p>
    </div>
  )
}

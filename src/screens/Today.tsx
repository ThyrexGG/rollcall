import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { currentTrainingDay, fmtDay, stepTrainingDay, today, weekday } from '../lib/dates'
import { DAY_LONG, SESSION_KINDS, STATUSES, STATUS_LABEL, type Player, type Status } from '../lib/types'
import { ConfirmButton, Icon, Jersey, Sheet } from '../components/ui'
import { sessionSummary, shareToTelegram } from '../lib/share'
import { go } from '../router'

const FLAG_TEXT: Record<string, string> = {
  different_player: 'Checked in from a phone that usually belongs to someone else',
  new_phone: 'Checked in from a new phone (their usual phone wasn’t used)',
  no_location: 'Location was off or blocked',
  weak_gps: 'GPS too weak to confirm they were at the court',
  court_not_set: 'Court location not saved yet',
}

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
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const checkinOpen = isToday && !!st.court.code && hhmm >= st.court.start && hhmm <= st.court.end
  const waiting = roster.filter((p) => day[p.id]?.pending)

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
            {total - marked ? (st.isClosed(date) && required ? `${total - marked} not checked in = absent` : `${total - marked} still to mark`) : total ? 'all marked' : ''}
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
                <Icon.qr /> {checkinOpen ? 'Court check-in live' : 'Court check-in'}
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
        {st.myInvites.map((i) => (
              <section key={i.owner} className="invite" role="status">
                <p><strong>{i.club_name}</strong> invited you to coach{i.role === 'viewer' ? ' (view only)' : ''}.</p>
                <div className="row-2">
                  <button type="button" className="btn" onClick={() => st.respondInvite(i.owner, false)}>Decline</button>
                  <button type="button" className="btn primary" onClick={() => st.respondInvite(i.owner, true)}>Accept</button>
                </div>
              </section>
            ))}
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
            {st.canEdit && waiting.length > 0 && (
              <section className="needs" aria-label="Check-ins to confirm">
                <div className="row-between">
                  <h2>Needs OK · {waiting.length}</h2>
                  {waiting.length > 1 && <button type="button" className="pill-btn accent" onClick={() => st.approveAll(date)}>Approve all</button>}
                </div>
                <ul className="stack-8">
                  {waiting.map((p) => (
                    <li key={p.id}>
                      <span className="who-text"><span className="name">{p.name}</span><span className="sub">{FLAG_TEXT[day[p.id]?.newPhone ? 'new_phone' : day[p.id]?.flag ?? 'no_location']}</span></span>
                      <button type="button" className="pill-btn" onClick={() => st.setMark(date, p.id, null)}>Reject</button>
                      <button type="button" className="pill-btn accent" onClick={() => st.approve(date, p.id)}>Approve</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
                            {m?.self ? <span className={`tag ${m.pending ? 'wait' : 'self'}`}>{m.pending ? 'Needs OK' : 'QR'}</span> : null}
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

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="Court check-in">
        {qrOpen && <CourtSheet live={checkinOpen} close={() => setQrOpen(false)} />}
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

function CourtSheet({ live, close }: { live: boolean; close: () => void }) {
  const st = useStore()
  const c = st.court
  return (
    <div className="stack-16">
      <p className={`court-status ${live ? 'ok' : 'warn'}`}>
        <Icon.qr />
        {live ? `Live now until ${c.end}. Players scan the poster at the court.` : `Opens automatically ${c.start}–${c.end} every day.`}
      </p>
      {!c.lat && <p className="banner info">Court location isn’t saved yet, so every QR check-in waits for your OK. Save it in History while you’re at the court.</p>}
      <p className="sheet-sub">Late after {c.late ?? 'no limit'} · must be within {c.radius} m of the court · one phone per player.</p>
      <div className="row-2">
        <button type="button" className="btn" onClick={() => { close(); go('history') }}>Settings</button>
        <button type="button" className="btn primary" onClick={() => { close(); go('poster') }}>Poster</button>
      </div>
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

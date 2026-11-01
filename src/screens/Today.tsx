import { useState } from 'react'
import { useStore } from '../lib/store'
import { addDays, fmtDay, today } from '../lib/dates'
import { SESSION_KINDS, STATUSES, STATUS_LABEL, type Player, type Status } from '../lib/types'
import { ConfirmButton, Icon, Jersey, Sheet } from '../components/ui'
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
  const [focus, setFocus] = useState<Player | null>(null)
  const [kindOpen, setKindOpen] = useState(false)

  return (
    <div className="screen">
      <header className="hero">
        <div className="hero-nav">
          <button className="icon-btn" type="button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon.back /></button>
          <div className="hero-date">
            <button type="button" className="kind-chip" onClick={() => setKindOpen(true)}>
              {session?.kind ?? 'Training'}{isToday ? ' · Today' : ''}
            </button>
            <label className="date-pick">
              <span className="date-big">{fmtDay(date)}</span>
              <input type="date" value={date} aria-label="Pick a date" onChange={(e) => e.target.value && setDate(e.target.value)} />
            </label>
          </div>
          <button className="icon-btn" type="button" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><Icon.next /></button>
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
        {!isToday && <button type="button" className="link on-dark" onClick={() => setDate(today())}>Jump to today</button>}
      </header>

      <main className="body">
        {total === 0 ? (
          <section className="empty">
            <Icon.ball size={40} />
            <h2>Add your squad first</h2>
            <p>Once your players are in, taking attendance is one tap per player.</p>
            <button type="button" className="btn primary" onClick={() => go('squad', 'add')}>Add players</button>
          </section>
        ) : (
          <>
            <div className="row-between">
              <span className="eyebrow">Squad · {total}</span>
              <button type="button" className="pill-btn accent" onClick={() => st.markRest(date)} disabled={marked === total}>Mark rest present</button>
            </div>
            <ul className="card list">
              {roster.map((p) => {
                const m = day[p.id]
                const s = st.statsFor(p.id)
                return (
                  <li key={p.id} className="mark-row">
                    <button type="button" className="who" onClick={() => setFocus(p)}>
                      <Jersey p={p} />
                      <span className="who-text">
                        <span className="name">{p.name}</span>
                        <span className="sub">
                          {[p.position, s.pct === null ? 'new' : `${s.pct}%`].filter(Boolean).join(' · ')}
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
                          onClick={() => st.setMark(date, p.id, m?.status === k ? null : k)}
                        >{k}</button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="hint">P present · L late · E excused · A absent. Tap again to unmark. Tap a name to add a note.</p>
            {session && (
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
    </div>
  )
}

function MarkSheet({ p, date, close }: { p: Player; date: string; close: () => void }) {
  const st = useStore()
  const m = st.dayMarks(date)[p.id]
  const [note, setNote] = useState(m?.note ?? '')
  return (
    <div className="stack-16">
      <p className="sheet-sub">{fmtDay(date)}{p.number ? ` · #${p.number}` : ''}{p.position ? ` · ${p.position}` : ''}</p>
      <div className="seg big" role="group" aria-label="Attendance">
        {STATUSES.map((k) => (
          <button key={k} type="button" className={`seg-b s-${k}${m?.status === k ? ' on' : ''}`} aria-pressed={m?.status === k}
            onClick={() => st.setMark(date, p.id, m?.status === k ? null : k)}>{STATUS_LABEL[k]}</button>
        ))}
      </div>
      <label className="field">
        <span>Note for this session</span>
        <textarea id={`note-${p.id}`} rows={3} maxLength={280} value={note} placeholder="e.g. Exam week, back Sunday" disabled={!m}
          onChange={(e) => setNote(e.target.value)} />
        {!m && <small>Mark attendance first to add a note.</small>}
      </label>
      <div className="row-2">
        <button type="button" className="btn" onClick={() => { close(); go('player', p.id) }}>View profile</button>
        <button type="button" className="btn primary" disabled={!m} onClick={async () => { await st.setNote(date, p.id, note); close() }}>Save note</button>
      </div>
    </div>
  )
}

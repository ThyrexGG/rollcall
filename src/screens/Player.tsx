import { useState } from 'react'
import { useStore } from '../lib/store'
import { fmtDay, fmtShort } from '../lib/dates'
import { FOLLOW_UP, POSITIONS, STATUS_LABEL, level, type Player as P, type Status } from '../lib/types'
import { ConfirmButton, Icon, Sheet } from '../components/ui'
import { go } from '../router'

export function Player({ id }: { id: string }) {
  const st = useStore()
  const p = st.players.find((x) => x.id === id)
  const [editing, setEditing] = useState(false)

  if (!p) {
    return (
      <div className="screen">
        <main className="body pad-top">
          <section className="empty"><h2>Player not found</h2><p>They may have been deleted.</p><button className="btn primary" type="button" onClick={() => go('squad')}>Back to squad</button></section>
        </main>
      </div>
    )
  }

  const s = st.statsFor(p.id)
  const all = st.sessions
    .map((sess) => ({ sess, m: st.marks[sess.id]?.[p.id] }))
    .filter((r) => r.m)
  const record = all.filter((r) => r.sess.required)
  const last = record.slice(-18)
  const recentCounted = record.filter((r) => r.m!.status !== 'E').slice(-5)
  const recentMissed = recentCounted.filter((r) => r.m!.status === 'A').length
  const notes = all.filter((r) => r.m!.note).reverse()
  const counted = st.activePlayers.map((x) => st.statsFor(x.id).pct).filter((v): v is number => v !== null)
  const avg = counted.length ? Math.round(counted.reduce((a, b) => a + b, 0) / counted.length) : null
  const lv = level(s.pct)

  return (
    <div className="screen">
      <header className="hero player-hero">
        <span className="ghost-num" aria-hidden="true">{p.number ?? ''}</span>
        <div className="row-between rel">
          <button type="button" className="icon-btn" aria-label="Back to squad" onClick={() => (history.length > 1 ? history.back() : go('squad'))}><Icon.back /></button>
          <button type="button" className="pill-btn on-dark" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <div className="rel stack-4">
          <span className="eyebrow accent">{[p.number ? `#${p.number}` : null, p.position, p.active ? null : 'Archived'].filter(Boolean).join(' · ') || 'Player'}</span>
          <h1 className="player-name">{p.name}</h1>
        </div>
        <div className="rel turnout-num">
          <span className="big">{s.pct === null ? '–' : `${s.pct}%`}</span>
          <span className="turnout-cap">attendance{avg !== null ? ` · squad avg ${avg}%` : ''}</span>
        </div>
      </header>

      <main className="body">
        {lv === 'low' && s.counted >= 3 && (
          <div className="banner danger" role="status">
            <Icon.alert />
            <span><strong>{recentMissed ? `Missed ${recentMissed} of the last ${recentCounted.length}.` : 'Low attendance.'}</strong> Below the {FOLLOW_UP}% follow-up line.</span>
          </div>
        )}

        <section className="card pad stack-12">
          <div className="row-between">
            <h2 className="h-label">{last.length === 1 ? 'Last training session' : `Last ${last.length || ''} training sessions`}</h2>
            {last.length > 0 && <span className="sub">oldest → newest</span>}
          </div>
          {last.length === 0 ? (
            <p className="sub">No sessions marked yet.</p>
          ) : (
            <ol className="dots">
              {last.map(({ sess, m }) => (
                <li key={sess.id} className={`dot s-${m!.status}`} title={`${fmtDay(sess.date)}: ${STATUS_LABEL[m!.status]}`}>
                  <span className="sr">{fmtDay(sess.date)}: {STATUS_LABEL[m!.status]}</span>
                  <span aria-hidden="true">{m!.status}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="tiles four">
          {(['P', 'L', 'E', 'A'] as Status[]).map((k) => (
            <div key={k} className="tile"><span className={`tile-n t-${k}`}>{s[k]}</span><span className="tile-l">{STATUS_LABEL[k]}</span></div>
          ))}
        </section>
        {s.extra > 0 && (
          <p className="bonus"><strong>+{s.extra}</strong> optional session{s.extra === 1 ? '' : 's'} attended. Extra effort, not counted in the %.</p>
        )}

        <section className="card pad stack-12">
          <h2 className="h-label">Notes</h2>
          {notes.length === 0 ? (
            <p className="sub">Notes you add while taking attendance show up here.</p>
          ) : (
            <ul className="notes">
              {notes.map(({ sess, m }) => (
                <li key={sess.id}>
                  <button type="button" onClick={() => go('today', sess.date)}>
                    <span className="sub">{fmtShort(sess.date)} · {sess.kind}{sess.required ? '' : ' (optional)'} · {STATUS_LABEL[m!.status]}</span>
                    <span>{m!.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit player">
        {editing && <EditPlayer p={p} done={() => setEditing(false)} />}
      </Sheet>
    </div>
  )
}

function EditPlayer({ p, done }: { p: P; done: () => void }) {
  const st = useStore()
  const [name, setName] = useState(p.name)
  const [number, setNumber] = useState(p.number ?? '')
  const [position, setPosition] = useState(p.position ?? '')
  return (
    <form
      className="stack-16"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return
        await st.updatePlayer(p.id, { name: name.trim().slice(0, 60), number: number.trim() || null, position: position || null })
        st.notify('Saved')
        done()
      }}
    >
      <div className="row-2 narrow-first">
        <label className="field"><span>Number</span><input id="edit-number" inputMode="numeric" maxLength={4} value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d]/g, ''))} /></label>
        <label className="field"><span>Name</span><input id="edit-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
      </div>
      <label className="field">
        <span>Position</span>
        <select id="edit-position" value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="">Not set</option>
          {POSITIONS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <button type="submit" className="btn primary">Save</button>
      <div className="row-2">
        <button type="button" className="btn" onClick={async () => { await st.updatePlayer(p.id, { active: !p.active }); st.notify(p.active ? 'Archived. History is kept.' : 'Back in the squad'); done() }}>
          {p.active ? 'Archive' : 'Restore'}
        </button>
        <ConfirmButton className="btn danger-outline" label="Delete" confirm="Tap again: erases history" onConfirm={async () => { await st.deletePlayer(p.id); done(); go('squad') }} />
      </div>
      <p className="hint">Archive hides a player from attendance but keeps their record. Delete removes them and their history for good.</p>
    </form>
  )
}

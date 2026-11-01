import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { DAY_LONG, FOLLOW_UP, POSITIONS, WATCH, level } from '../lib/types'
import { Icon, Jersey, Sheet } from '../components/ui'
import { go } from '../router'

type Sort = 'low' | 'normal' | 'name'

export function Squad({ openAdd }: { openAdd: boolean }) {
  const st = useStore()
  const [sort, setSort] = useState<Sort>('low')
  const [adding, setAdding] = useState(openAdd)
  const [showArchived, setShowArchived] = useState(false)
  useEffect(() => { if (openAdd) setAdding(true) }, [openAdd])

  const active = st.activePlayers
  const archived = st.players.filter((p) => !p.active)
  const all = active.map((p) => st.statsFor(p.id))
  const average = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const avg = average(all.map((s) => s.pct))
  const avgNormal = average(all.map((s) => s.normal.pct))
  const followUp = all.filter((s) => s.pct !== null && s.pct < FOLLOW_UP).length

  const rows = useMemo(() => {
    const list = active.map((p) => ({ p, s: st.statsFor(p.id) }))
    const byName = (a: { p: { name: string } }, b: { p: { name: string } }) => a.p.name.localeCompare(b.p.name)
    if (sort === 'low') list.sort((a, b) => (a.s.pct ?? 101) - (b.s.pct ?? 101) || byName(a, b))
    if (sort === 'normal') list.sort((a, b) => (a.s.normal.pct ?? 101) - (b.s.normal.pct ?? 101) || byName(a, b))
    if (sort === 'name') list.sort(byName)
    return list
  }, [active, st, sort])

  return (
    <div className="screen">
      <header className="page-head">
        <div className="row-between">
          <h1>Squad</h1>
          <button type="button" className="icon-btn solid" aria-label="Add players" onClick={() => setAdding(true)}><Icon.plus /></button>
        </div>
        <div className="tiles">
          <div className="tile dark"><span className="tile-n">{avg === null ? '–' : `${avg}%`}</span><span className="tile-l">Training days avg</span></div>
          <div className="tile"><span className="tile-n t-E">{avgNormal === null ? '–' : `${avgNormal}%`}</span><span className="tile-l">Normal days avg</span></div>
          <div className="tile"><span className={`tile-n${followUp ? ' danger' : ''}`}>{followUp}</span><span className="tile-l">Need follow-up</span></div>
        </div>
        {active.length > 1 && (
          <div className="chips" role="group" aria-label="Sort players">
            {([['low', 'Lowest training'], ['normal', 'Lowest normal'], ['name', 'Name']] as [Sort, string][]).map(([k, l]) => (
              <button key={k} type="button" className={`chip${sort === k ? ' on' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
        )}
      </header>

      <main className="body">
        {active.length === 0 ? (
          <section className="empty">
            <Icon.ball size={40} />
            <h2>No players yet</h2>
            <p>Paste your whole roster at once, one player per line.</p>
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>Add players</button>
          </section>
        ) : (
          <ul className="card list">
            {rows.map(({ p, s }) => {
              const lv = level(s.pct)
              return (
                <li key={p.id}>
                  <button type="button" className="squad-row" onClick={() => go('player', p.id)}>
                    <span className="squad-top">
                      <Jersey p={p} />
                      <span className="who-text">
                        <span className="name">{p.name}</span>
                        {p.position && <span className="sub">{p.position}</span>}
                      </span>
                      <span className="pcts">
                        <span className={`pct lv-${lv}`}><small>Training</small>{s.pct === null ? '–' : `${s.pct}%`}</span>
                        <span className="pct normal"><small>Normal</small>{s.normal.pct === null ? '–' : `${s.normal.pct}%`}</span>
                      </span>
                    </span>
                    <span className="meters" aria-hidden="true">
                      <span className={`meter lv-${lv}`}><i style={{ width: `${s.pct ?? 0}%` }} /></span>
                      <span className="meter normal"><i style={{ width: `${s.normal.pct ?? 0}%` }} /></span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {active.length > 0 && (
          <p className="hint">Training = {st.trainingDays.map((d) => DAY_LONG[d]).join(' and ')} sessions. Normal = every other day. Each % = (present + late) ÷ (present + late + absent); excused never counts against a player. Follow-up is based on training days: under {FOLLOW_UP}% needs follow-up, {FOLLOW_UP}–{WATCH - 1}% is one to watch.</p>
        )}
        {archived.length > 0 && (
          <div className="stack-8">
            <button type="button" className="link" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide' : 'Show'} {archived.length} archived player{archived.length === 1 ? '' : 's'}
            </button>
            {showArchived && (
              <ul className="card list">
                {archived.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="squad-row muted" onClick={() => go('player', p.id)}>
                      <span className="squad-top"><Jersey p={p} /><span className="who-text"><span className="name">{p.name}</span><span className="sub">Archived</span></span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      <Sheet open={adding} onClose={() => { setAdding(false); if (openAdd) go('squad') }} title="Add players">
        <AddPlayers done={() => { setAdding(false); if (openAdd) go('squad') }} />
      </Sheet>
    </div>
  )
}

/** "7 Dara Setter" → number 7, name Dara, position Setter (position matched from the known list). */
export function parseLine(line: string): { name: string; number: string | null; position: string | null } | null {
  let t = line.trim().replace(/\s+/g, ' ')
  if (!t) return null
  let number: string | null = null
  const m = t.match(/^#?(\d{1,3})[\s.\-:,]+(.+)$/)
  if (m) { number = m[1]; t = m[2] }
  let position: string | null = null
  const lower = t.toLowerCase()
  for (const pos of [...POSITIONS].sort((a, b) => b.length - a.length)) {
    const pl = pos.toLowerCase()
    if (lower.endsWith(' ' + pl) || lower.endsWith(', ' + pl) || lower.endsWith(' - ' + pl)) {
      position = pos
      t = t.slice(0, t.length - pl.length).replace(/[\s,\-]+$/, '')
      break
    }
  }
  const name = t.slice(0, 60)
  return name ? { name, number, position } : null
}

function AddPlayers({ done }: { done: () => void }) {
  const st = useStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = text.split(/\r?\n/).map(parseLine).filter((x): x is NonNullable<typeof x> => !!x)
  return (
    <form
      className="stack-16"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!parsed.length) return
        setBusy(true)
        const n = await st.addPlayers(parsed)
        setBusy(false)
        if (n) { st.notify(`${n} player${n === 1 ? '' : 's'} added`); setText(''); done() }
      }}
    >
      <label className="field">
        <span>One player per line</span>
        <textarea id="bulk-add" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Dara Setter\n4 Sophea Outside\n7 Vibol Middle\nRithy'} autoFocus />
        <small>Jersey number first and position last are optional. Positions: {POSITIONS.join(', ')}.</small>
      </label>
      {parsed.length > 0 && (
        <ul className="preview">
          {parsed.slice(0, 30).map((p, i) => (
            <li key={i}><Jersey p={p} size={28} /><span>{p.name}</span>{p.position && <em>{p.position}</em>}</li>
          ))}
        </ul>
      )}
      <button type="submit" className="btn primary" disabled={!parsed.length || busy}>
        {busy ? 'Adding…' : parsed.length ? `Add ${parsed.length} player${parsed.length === 1 ? '' : 's'}` : 'Add players'}
      </button>
    </form>
  )
}

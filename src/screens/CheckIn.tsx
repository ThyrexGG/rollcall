import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDay } from '../lib/dates'
import { Icon } from '../components/ui'
import type { Status } from '../lib/types'

interface Info {
  date: string
  kind: string
  required: boolean
  late_after: string | null
  players: { id: string; name: string; status: Status | null }[]
}

const WORD: Record<Status, string> = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' }

/** Public page players reach by scanning the coach's QR code. No account needed. */
export function CheckIn({ code }: { code: string }) {
  const doneKey = `rollcall-checkin-${code}`
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ name: string; status: Status } | null>(() => {
    try { const v = localStorage.getItem(doneKey); return v ? JSON.parse(v) : null } catch { return null }
  })

  useEffect(() => {
    supabase.rpc('checkin_info', { p_code: code }).then(({ data, error }) => {
      if (error) { setErr('Could not reach the server. Check your connection and reload.'); setInfo(null); return }
      setInfo((data as Info) ?? null)
    })
  }, [code])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (info?.players ?? []).filter((p) => !t || p.name.toLowerCase().includes(t))
  }, [info, q])

  async function confirm() {
    if (!picked) return
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('checkin', { p_code: code, p_player: picked.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const res = { name: picked.name, status: data as Status }
    setDone(res)
    try { localStorage.setItem(doneKey, JSON.stringify(res)) } catch { /* ignore */ }
  }

  return (
    <div className="checkin">
      <header className="checkin-head">
        <span className="logo small" aria-hidden="true">R</span>
        <div>
          <p className="eyebrow accent">Rollcall check-in</p>
          <h1>{info ? `${fmtDay(info.date)} · ${info.required ? 'Training' : 'Normal day'}` : 'Volleyball check-in'}</h1>
        </div>
      </header>

      <main className="checkin-body">
        {info === undefined && <p className="hint center-text">Loading…</p>}

        {info === null && (
          <section className="empty">
            <Icon.alert />
            <h2>Check-in is closed</h2>
            <p>{err ?? 'This code has expired or the coach closed check-in. Ask the coach to mark you.'}</p>
          </section>
        )}

        {info && done && (
          <section className={`done s-${done.status}`}>
            <span className="done-mark" aria-hidden="true">{done.status}</span>
            <h2>You’re in, {done.name}</h2>
            <p>Marked <strong>{WORD[done.status]}</strong> for {fmtDay(info.date)}.{done.status === 'L' ? ' Check-in after the start time counts as late.' : ''}</p>
            <button type="button" className="link" onClick={() => { setDone(null); setPicked(null); try { localStorage.removeItem(doneKey) } catch { /* ignore */ } }}>Not you? Check in someone else</button>
          </section>
        )}

        {info && !done && !picked && (
          <>
            <p className="checkin-lead">Tap your name.{info.late_after ? ` After ${info.late_after} counts as late.` : ''}</p>
            <label className="search">
              <Icon.search />
              <input id="checkin-search" type="search" placeholder="Search your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your name" />
            </label>
            <ul className="card list">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" className="checkin-row" disabled={!!p.status} onClick={() => setPicked(p)}>
                    <span className="name">{p.name}</span>
                    {p.status ? <span className={`tag s-${p.status}`}>{WORD[p.status]}</span> : <Icon.next />}
                  </button>
                </li>
              ))}
            </ul>
            {shown.length === 0 && <p className="hint center-text">No name matches. Ask the coach to add you.</p>}
          </>
        )}

        {info && !done && picked && (
          <section className="confirm-card">
            <p className="eyebrow">Confirm</p>
            <h2>I’m {picked.name}</h2>
            <p className="hint">Only check in yourself. The coach sees every check-in.</p>
            {err && <p className="form-msg err light" role="alert">{err}</p>}
            <div className="row-2">
              <button type="button" className="btn" onClick={() => setPicked(null)}>Back</button>
              <button type="button" className="btn primary" disabled={busy} onClick={confirm}>{busy ? 'Checking in…' : 'Check me in'}</button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDay } from '../lib/dates'
import { Icon } from '../components/ui'
import type { Status } from '../lib/types'

interface Info {
  club_name: string
  date: string
  open: boolean
  start: string
  end: string
  late_after: string | null
  training_day: boolean
  needs_location: boolean
  players: { id: string; name: string; status: Status | null }[]
}
interface Result { name: string; status: Status; needs_ok: boolean; already: boolean }

const WORD: Record<Status, string> = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' }

function deviceId(): string {
  try {
    let id = localStorage.getItem('rollcall-device')
    if (!id) {
      const a = new Uint32Array(4); crypto.getRandomValues(a)
      id = Array.from(a, (x) => x.toString(36)).join('').slice(0, 24).padEnd(12, 'x')
      localStorage.setItem('rollcall-device', id)
    }
    return id
  } catch { return '' }
}

function locate(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
  })
}

/** Page players reach by scanning the printed court QR. No account needed. */
export function CourtCheckIn({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [step, setStep] = useState<'idle' | 'locating' | 'sending'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<Result | null>(null)
  const doneKey = info ? `rollcall-court-${code}-${info.date}` : ''

  useEffect(() => {
    supabase.rpc('court_info', { p_code: code }).then(({ data, error }) => {
      if (error) { setErr('Could not reach the server. Check your connection and reload.'); setInfo(null); return }
      setInfo((data as Info) ?? null)
    })
  }, [code])

  useEffect(() => {
    if (!doneKey) return
    try { const v = localStorage.getItem(doneKey); if (v) setDone(JSON.parse(v)) } catch { /* ignore */ }
  }, [doneKey])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (info?.players ?? []).filter((p) => !t || p.name.toLowerCase().includes(t))
  }, [info, q])

  async function confirm() {
    if (!picked || !info) return
    setErr(null)
    let pos: GeolocationPosition | null = null
    if (info.needs_location) { setStep('locating'); pos = await locate() }
    setStep('sending')
    const { data, error } = await supabase.rpc('court_checkin', {
      p_code: code, p_player: picked.id, p_device: deviceId(),
      p_lat: pos?.coords.latitude ?? null, p_lng: pos?.coords.longitude ?? null, p_accuracy: pos?.coords.accuracy ?? null,
    })
    setStep('idle')
    if (error) { setErr(error.message); return }
    const r = data as Omit<Result, 'name'>
    const res = { ...r, name: picked.name }
    setDone(res)
    try { localStorage.setItem(doneKey, JSON.stringify(res)) } catch { /* ignore */ }
  }

  return (
    <div className="checkin">
      <header className="checkin-head">
        <span className="logo small" aria-hidden="true">R</span>
        <div>
          <p className="eyebrow accent">{info?.club_name ?? 'Rollcall'}</p>
          <h1>{info ? `${fmtDay(info.date)} · ${info.training_day ? 'Training' : 'Normal day'}` : 'Court check-in'}</h1>
        </div>
      </header>

      <main className="checkin-body">
        {info === undefined && <p className="hint center-text">Loading…</p>}

        {info === null && (
          <section className="empty">
            <Icon.alert />
            <h2>This code doesn’t work</h2>
            <p>{err ?? 'The coach may have printed a new poster. Scan the one at the court.'}</p>
          </section>
        )}

        {info && !info.open && !done && (
          <section className="empty">
            <Icon.history />
            <h2>Check-in is closed</h2>
            <p>Scan this code at the court between <strong>{info.start}</strong> and <strong>{info.end}</strong>.</p>
          </section>
        )}

        {info && done && (
          <section className={`done s-${done.status}`}>
            <span className="done-mark" aria-hidden="true">{done.status}</span>
            <h2>{done.already ? `Already in, ${done.name}` : `You’re in, ${done.name}`}</h2>
            <p>Marked <strong>{WORD[done.status]}</strong> for {fmtDay(info.date)}.{done.status === 'L' && !done.already ? ` Check-in after ${info.late_after} counts as late.` : ''}</p>
            {done.needs_ok && <p className="banner info">Your location couldn’t be checked, so the coach will confirm this one.</p>}
          </section>
        )}

        {info && info.open && !done && !picked && (
          <>
            <p className="checkin-lead">Tap your name.{info.late_after ? ` After ${info.late_after} counts as late.` : ''}</p>
            <label className="search">
              <Icon.search />
              <input id="checkin-search" type="search" placeholder="Search your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your name" />
            </label>
            <ul className="card list">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" className="checkin-row" disabled={!!p.status} onClick={() => { setPicked(p); setErr(null) }}>
                    <span className="name">{p.name}</span>
                    {p.status ? <span className={`tag s-${p.status}`}>{WORD[p.status]}</span> : <Icon.next />}
                  </button>
                </li>
              ))}
            </ul>
            {shown.length === 0 && <p className="hint center-text">No name matches. Ask the coach to add you.</p>}
          </>
        )}

        {info && info.open && !done && picked && (
          <section className="confirm-card">
            <p className="eyebrow">Confirm</p>
            <h2>I’m {picked.name}</h2>
            {info.needs_location && (
              <p className="hint">Next, your phone asks to share your location. Tap <strong>Allow</strong>; it only checks you’re at the court.</p>
            )}
            {err && <p className="form-msg err light" role="alert">{err}</p>}
            <div className="row-2">
              <button type="button" className="btn" onClick={() => { setPicked(null); setErr(null) }}>Back</button>
              <button type="button" className="btn primary" disabled={step !== 'idle'} onClick={confirm}>
                {step === 'locating' ? 'Finding you…' : step === 'sending' ? 'Checking in…' : 'Check me in'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

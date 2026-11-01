import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDay } from '../lib/dates'
import { Icon } from '../components/ui'
import type { Status } from '../lib/types'

interface Info {
  club_name: string
  date: string
  open: boolean
  staff: boolean
  start: string
  end: string
  late_after: string | null
  training_day: boolean
  needs_location: boolean
  me: { id: string; name: string } | null
  players: { id: string; name: string; status: Status | null }[]
}
interface Result { id: string; name: string; status: Status; needs_ok: boolean; already: boolean; at: number }

const WORD: Record<Status, string> = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' }
const UNDO_MS = 2 * 60 * 1000

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

/** Page players reach by scanning the printed court QR. No account needed. Signed-in coaches get coach mode. */
export function CourtCheckIn({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [step, setStep] = useState<'idle' | 'locating' | 'sending' | 'undoing'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<Result | null>(null)
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState<string | null>(null)
  const doneKey = info ? `rollcall-court-${code}-${info.date}` : ''

  const load = useCallback(() => supabase.rpc('court_page', { p_code: code, p_device: deviceId() }).then(({ data, error }) => {
    if (error) { setErr('Could not reach the server. Check your connection and reload.'); setInfo(null); return }
    setInfo((data as Info) ?? null)
  }), [code])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!doneKey) return
    try { const v = localStorage.getItem(doneKey); if (v) setDone(JSON.parse(v)) } catch { /* ignore */ }
  }, [doneKey])
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (info?.players ?? []).filter((p) => !t || p.name.toLowerCase().includes(t))
  }, [info, q])

  async function checkIn(p: { id: string; name: string }) {
    if (!info) return
    setErr(null)
    let pos: GeolocationPosition | null = null
    if (info.needs_location) { setStep('locating'); pos = await locate() }
    setStep('sending')
    const { data, error } = await supabase.rpc('court_checkin_v2', {
      p_code: code, p_player: p.id, p_device: deviceId(),
      p_lat: pos?.coords.latitude ?? null, p_lng: pos?.coords.longitude ?? null, p_accuracy: pos?.coords.accuracy ?? null,
    })
    setStep('idle')
    if (error) { setErr(error.message); return false }
    const r = data as { status: Status; needs_ok: boolean; already: boolean; staff: boolean }
    if (info.staff) {
      setToast(`${p.name} checked in (${WORD[r.status]})`)
      window.setTimeout(() => setToast(null), 2200)
      setPicked(null); setQ('')
      load()
      return true
    }
    const res: Result = { id: p.id, name: p.name, status: r.status, needs_ok: r.needs_ok, already: r.already, at: Date.now() }
    setDone(res)
    try { localStorage.setItem(doneKey, JSON.stringify(res)) } catch { /* ignore */ }
    return true
  }

  async function undo() {
    if (!done) return
    setStep('undoing'); setErr(null)
    const { error } = await supabase.rpc('court_undo', { p_code: code, p_device: deviceId(), p_player: done.id })
    setStep('idle')
    if (error) { setErr(/court_undo|PGRST202|function/i.test(error.message + (error.code ?? '')) ? 'Undo isn’t available yet. Ask the coach to fix it.' : error.message); return }
    try { localStorage.removeItem(doneKey) } catch { /* ignore */ }
    setDone(null); setPicked(null); setChoosing(true)
    load()
  }

  const canUndo = !!done && !done.already && now - done.at < UNDO_MS
  const secsLeft = done ? Math.max(0, Math.floor((UNDO_MS - (now - done.at)) / 1000)) : 0
  const me = info?.me && info.players.some((p) => p.id === info.me!.id) ? info.me : null
  const meStatus = me ? info!.players.find((p) => p.id === me.id)?.status ?? null : null
  const showList = info && (info.open || info.staff) && !done && !picked && (info.staff || !me || choosing || !!meStatus)

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

        {info?.staff && (
          <p className="banner coach" role="status">
            <strong>Coach mode.</strong> You’re signed in as a coach, so time, location and phone rules are skipped. Tap any name to check them in.
          </p>
        )}

        {info && !info.open && !info.staff && !done && (
          <section className="empty">
            <Icon.history />
            <h2>Check-in is closed</h2>
            <p>Scan this code at the court between <strong>{info.start}</strong> and <strong>{info.end}</strong>.</p>
          </section>
        )}

        {/* result */}
        {info && done && (
          <section className={`done s-${done.status}`}>
            <span className="done-mark" aria-hidden="true">{done.status}</span>
            <h2>{done.already ? `Already in, ${done.name}` : `You’re in, ${done.name}`}</h2>
            <p>Marked <strong>{WORD[done.status]}</strong> for {fmtDay(info.date)}.{done.status === 'L' && !done.already ? ` Check-in after ${info.late_after} counts as late.` : ''}</p>
            {done.needs_ok && <p className="banner info">The coach will confirm this check-in.</p>}
            {err && <p className="form-msg err light" role="alert">{err}</p>}
            {canUndo && (
              <button type="button" className="btn danger-outline" disabled={step !== 'idle'} onClick={undo}>
                {step === 'undoing' ? 'Undoing…' : `Wrong name? Undo (${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')})`}
              </button>
            )}
          </section>
        )}

        {/* phone already knows its player: one big button */}
        {info && info.open && !info.staff && !done && !picked && me && !choosing && !meStatus && (
          <section className="me-card">
            <p className="eyebrow">This phone</p>
            <button type="button" className="btn accent big me-btn" disabled={step !== 'idle'} onClick={() => checkIn(me)}>
              {step === 'locating' ? 'Finding you…' : step === 'sending' ? 'Checking in…' : `Check in as ${me.name}`}
            </button>
            {info.needs_location && step === 'idle' && <p className="hint">Your phone will ask for your location. Tap Allow.</p>}
            {err && <p className="form-msg err light" role="alert">{err}</p>}
            <button type="button" className="link" onClick={() => { setChoosing(true); setErr(null) }}>Not {me.name}? Choose another name</button>
          </section>
        )}

        {showList && (
          <>
            <p className="checkin-lead">{info.staff ? 'Check in a player' : 'Tap your name.'}{!info.staff && info.late_after ? ` After ${info.late_after} counts as late.` : ''}</p>
            {me && choosing && !info.staff && (
              <p className="banner info">This phone usually checks in {me.name}. A different name goes to the coach to confirm.</p>
            )}
            <label className="search">
              <Icon.search />
              <input id="checkin-search" type="search" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search name" />
            </label>
            <ul className="card list">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" className="checkin-row" disabled={!!p.status || step !== 'idle'}
                    onClick={() => (info.staff ? checkIn(p) : (setPicked(p), setErr(null)))}>
                    <span className="name">{p.name}</span>
                    {p.status ? <span className={`tag s-${p.status}`}>{WORD[p.status]}</span> : <Icon.next />}
                  </button>
                </li>
              ))}
            </ul>
            {err && <p className="form-msg err light" role="alert">{err}</p>}
            {shown.length === 0 && <p className="hint center-text">No name matches. Ask the coach to add you.</p>}
          </>
        )}

        {info && info.open && !info.staff && !done && picked && (
          <section className="confirm-card">
            <p className="eyebrow">Confirm</p>
            <h2>I’m {picked.name}</h2>
            <p className="hint">Check the name. You can undo for 2 minutes if it’s wrong.</p>
            {info.needs_location && <p className="hint">Next, your phone asks for your location. Tap <strong>Allow</strong>; it only checks you’re at the court.</p>}
            {err && <p className="form-msg err light" role="alert">{err}</p>}
            <div className="row-2">
              <button type="button" className="btn" onClick={() => { setPicked(null); setErr(null) }}>Back</button>
              <button type="button" className="btn primary" disabled={step !== 'idle'} onClick={() => checkIn(picked)}>
                {step === 'locating' ? 'Finding you…' : step === 'sending' ? 'Checking in…' : 'Check me in'}
              </button>
            </div>
          </section>
        )}
      </main>
      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}

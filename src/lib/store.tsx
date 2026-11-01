import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import {
  DEFAULT_TRAINING_DAYS, emptyTally, finishTally,
  type Coach, type Court, type Mark, type Player, type Role, type Session, type Stats, type Status,
} from './types'
import { weekday } from './dates'

type Marks = Record<string, Record<string, Mark>> // sessionId (or "pending:<date>") -> playerId -> mark

/** A mark change waiting to reach the server. Keyed by `${date}|${playerId}`; the latest change wins. */
interface QueuedMark { date: string; playerId: string; status: Status | null; note?: string | null; t: number }
type Queue = Record<string, QueuedMark>

interface Cache { players: Player[]; sessions: Session[]; marks: Marks; trainingDays: number[]; clubName: string; club: { owner: string; role: Role }; court?: Court }

interface Store {
  loading: boolean
  error: string | null
  offline: boolean
  pendingCount: number
  club: { owner: string; role: Role }
  canEdit: boolean
  clubName: string
  court: Court
  saveCourt: (patch: Partial<Court>) => Promise<boolean>
  newCourtCode: () => Promise<void>
  approve: (date: string, playerId: string) => Promise<void>
  setClubName: (name: string) => Promise<void>
  players: Player[]
  activePlayers: Player[]
  sessions: Session[]
  marks: Marks
  trainingDays: number[]
  setTrainingDays: (days: number[]) => Promise<void>
  isRequired: (date: string) => boolean
  setRequired: (date: string, required: boolean) => Promise<void>
  sessionFor: (date: string) => Session | undefined
  dayMarks: (date: string) => Record<string, Mark>
  statsFor: (playerId: string) => Stats
  setMark: (date: string, playerId: string, status: Status | null) => void
  setNote: (date: string, playerId: string, note: string) => void
  markRest: (date: string, status?: Status) => void
  setKind: (date: string, kind: string) => Promise<void>
  deleteSession: (date: string) => Promise<void>
  openCheckin: (date: string, lateAfter: string | null) => Promise<Session | null>
  closeCheckin: (date: string) => Promise<void>
  addPlayers: (rows: { name: string; number: string | null; position: string | null }[]) => Promise<number>
  updatePlayer: (id: string, patch: Partial<Pick<Player, 'name' | 'number' | 'position' | 'active'>>) => Promise<void>
  deletePlayer: (id: string) => Promise<void>
  coaches: Coach[]
  addCoach: (email: string, role: 'viewer' | 'editor') => Promise<boolean>
  removeCoach: (coachId: string) => Promise<void>
  reload: () => Promise<void>
  toast: string | null
  notify: (msg: string) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

function byNumberThenName(a: Player, b: Player) {
  const na = parseInt(a.number ?? '', 10)
  const nb = parseInt(b.number ?? '', 10)
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
  if (isNaN(na) !== isNaN(nb)) return isNaN(na) ? 1 : -1
  return a.name.localeCompare(b.name)
}

const DEFAULT_COURT: Court = { code: null, lat: null, lng: null, radius: 150, start: '17:00', end: '20:30', late: '17:45' }
const hm = (t: string | null) => (t ? t.slice(0, 5) : null)

const SESSION_COLS = 'id,date,kind,required,checkin_code,checkin_until,late_after'

function readJSON<T>(key: string): T | null {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full or blocked */ }
}

function randomCode(n = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const a = new Uint32Array(n)
  crypto.getRandomValues(a)
  return Array.from(a, (x) => chars[x % chars.length]).join('')
}

/** Lay queued (unsynced) changes over server data so a reload never hides them. */
function applyQueue(marks: Marks, sessions: Session[], queue: Queue): Marks {
  const out: Marks = { ...marks }
  for (const q of Object.values(queue)) {
    const sid = sessions.find((s) => s.date === q.date)?.id ?? `pending:${q.date}`
    const day = { ...(out[sid] || {}) }
    if (q.status) day[q.playerId] = { status: q.status, note: q.note !== undefined ? q.note : day[q.playerId]?.note ?? null, self: false }
    else delete day[q.playerId]
    out[sid] = day
  }
  return out
}

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const cacheKey = `rollcall-cache-${userId}`
  const queueKey = `rollcall-queue-${userId}`
  const cached = useRef(readJSON<Cache>(cacheKey)).current

  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [club, setClub] = useState<{ owner: string; role: Role }>(cached?.club ?? { owner: userId, role: 'owner' })
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? [])
  const [sessions, setSessions] = useState<Session[]>(cached?.sessions ?? [])
  const [marks, setMarks] = useState<Marks>(() => applyQueue(cached?.marks ?? {}, cached?.sessions ?? [], readJSON<Queue>(queueKey) ?? {}))
  const [trainingDays, setDays] = useState<number[]>(cached?.trainingDays ?? DEFAULT_TRAINING_DAYS)
  const [clubName, setClubNameState] = useState(cached?.clubName ?? 'Volleyball club')
  const [court, setCourt] = useState<Court>(cached?.court ?? DEFAULT_COURT)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [queue, setQueue] = useState<Queue>(() => readJSON<Queue>(queueKey) ?? {})
  const [toast, setToast] = useState<string | null>(null)

  const toastTimer = useRef<number | undefined>(undefined)
  const pending = useRef<Record<string, Promise<Session>>>({})
  const sessionsRef = useRef(sessions); sessionsRef.current = sessions
  const playersRef = useRef(players); playersRef.current = players
  const marksRef = useRef(marks); marksRef.current = marks
  const daysRef = useRef(trainingDays); daysRef.current = trainingDays
  const clubRef = useRef(club); clubRef.current = club
  const queueRef = useRef(queue); queueRef.current = queue
  const flushing = useRef(false)
  const flushAgain = useRef(false)

  const canEdit = club.role !== 'viewer'

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const fail = useCallback((what: string, e: unknown) => {
    console.error(what, e)
    const msg = (e as { message?: string })?.message ?? ''
    if (!navigator.onLine || /fetch|network/i.test(msg)) notify(`You're offline. ${what} needs a connection.`)
    else notify(`${what} didn't save. ${msg && msg.length < 120 ? msg : 'Try again.'}`)
  }, [notify])

  const saveQueue = useCallback((q: Queue) => {
    queueRef.current = q
    setQueue(q)
    writeJSON(queueKey, q)
  }, [queueKey])

  // ---------- load ----------
  const reload = useCallback(async () => {
    try {
      const link = await supabase.from('coaches').select('owner,role').eq('coach', userId).maybeSingle()
      if (link.error) throw link.error
      const c = link.data ? { owner: link.data.owner as string, role: link.data.role as Role } : { owner: userId, role: 'owner' as Role }
      const [p, s, a, cfg, co] = await Promise.all([
        supabase.from('players').select('id,name,number,position,active,created_at').eq('owner', c.owner),
        supabase.from('sessions').select(SESSION_COLS).eq('owner', c.owner).order('date'),
        supabase.from('attendance').select('session_id,player_id,status,note,self_checked,needs_ok,distance_m').eq('owner', c.owner),
        supabase.from('settings').select('training_days,club_name,court_code,court_lat,court_lng,court_radius_m,checkin_start,checkin_end,checkin_late').eq('owner', c.owner).maybeSingle(),
        c.role === 'owner' ? supabase.from('coaches').select('coach,coach_email,role').eq('owner', userId) : Promise.resolve({ data: [], error: null }),
      ])
      const err = p.error || s.error || a.error || cfg.error
      if (err) throw err
      const ps = (p.data as Player[]).sort(byNumberThenName)
      const ss = s.data as Session[]
      const m: Marks = {}
      for (const r of a.data as { session_id: string; player_id: string; status: Status; note: string | null; self_checked: boolean; needs_ok: boolean; distance_m: number | null }[]) {
        ;(m[r.session_id] ||= {})[r.player_id] = { status: r.status, note: r.note, self: r.self_checked, pending: r.needs_ok, distance: r.distance_m }
      }
      const cd = cfg.data as Record<string, unknown> | null
      const ct: Court = cd ? {
        code: (cd.court_code as string) ?? null, lat: (cd.court_lat as number) ?? null, lng: (cd.court_lng as number) ?? null,
        radius: (cd.court_radius_m as number) ?? 150, start: hm(cd.checkin_start as string) ?? '17:00', end: hm(cd.checkin_end as string) ?? '20:30',
        late: hm((cd.checkin_late as string) ?? null),
      } : DEFAULT_COURT
      const days = (cfg.data as { training_days: number[] } | null)?.training_days ?? DEFAULT_TRAINING_DAYS
      const name = (cfg.data as { club_name: string } | null)?.club_name ?? 'Volleyball club'
      setClub(c); setPlayers(ps); setSessions(ss); setDays(days); setClubNameState(name); setCourt(ct)
      setCoaches((co.data as Coach[]) ?? [])
      setMarks(applyQueue(m, ss, queueRef.current))
      writeJSON(cacheKey, { players: ps, sessions: ss, marks: m, trainingDays: days, clubName: name, club: c, court: ct } satisfies Cache)
      setOffline(false); setError(null)
    } catch (e) {
      console.error('load', e)
      if (cached || playersRef.current.length) setOffline(true)
      else setError('Could not load your squad. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [userId, cacheKey, cached])

  // keep the on-device copy current so the app opens with the latest data even without signal
  useEffect(() => {
    if (loading) return
    const t = window.setTimeout(() => {
      const clean: Marks = {}
      for (const [k, v] of Object.entries(marks)) if (!k.startsWith('pending:')) clean[k] = v
      writeJSON(cacheKey, { players, sessions, marks: clean, trainingDays, clubName, club, court } satisfies Cache)
    }, 400)
    return () => window.clearTimeout(t)
  }, [loading, players, sessions, marks, trainingDays, clubName, club, court, cacheKey])

  // ---------- sessions ----------
  const ensureSession = useCallback(async (date: string): Promise<Session> => {
    const existing = sessionsRef.current.find((s) => s.date === date)
    if (existing) return existing
    if (date in pending.current) return pending.current[date]
    const p = (async () => {
      const { data, error } = await supabase
        .from('sessions')
        .upsert({ date, owner: clubRef.current.owner, required: daysRef.current.includes(weekday(date)) }, { onConflict: 'owner,date', ignoreDuplicates: false })
        .select(SESSION_COLS)
        .single()
      if (error) throw error
      const s = data as Session
      setSessions((prev) => {
        const next = prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => a.date.localeCompare(b.date))
        sessionsRef.current = next
        return next
      })
      // move marks made before the session existed onto its real id
      setMarks((prev) => {
        const tmp = prev[`pending:${date}`]
        if (!tmp) return prev
        const next = { ...prev, [s.id]: { ...(prev[s.id] || {}), ...tmp } }
        delete next[`pending:${date}`]
        return next
      })
      return s
    })()
    pending.current[date] = p
    try { return await p } finally { delete pending.current[date] }
  }, [])

  // ---------- sync queue ----------
  const flush = useCallback(async () => {
    if (flushing.current) { flushAgain.current = true; return }
    flushing.current = true
    try {
      do {
        flushAgain.current = false
        const q = queueRef.current
        const entries = Object.entries(q)
        if (!entries.length) break
        const byDate: Record<string, [string, QueuedMark][]> = {}
        for (const e of entries) (byDate[e[1].date] ||= []).push(e)
        const done: Record<string, number> = {}
        let networkDown = false
        for (const [date, items] of Object.entries(byDate)) {
          try {
            const s = await ensureSession(date)
            const owner = clubRef.current.owner
            const withNote = items.filter(([, i]) => i.status && i.note !== undefined)
            const noNote = items.filter(([, i]) => i.status && i.note === undefined)
            const dels = items.filter(([, i]) => !i.status)
            const now = new Date().toISOString()
            if (noNote.length) {
              const { error } = await supabase.from('attendance').upsert(
                noNote.map(([, i]) => ({ session_id: s.id, player_id: i.playerId, owner, status: i.status, needs_ok: false, updated_at: now })),
                { onConflict: 'session_id,player_id' })
              if (error) throw error
            }
            if (withNote.length) {
              const { error } = await supabase.from('attendance').upsert(
                withNote.map(([, i]) => ({ session_id: s.id, player_id: i.playerId, owner, status: i.status, note: i.note, needs_ok: false, updated_at: now })),
                { onConflict: 'session_id,player_id' })
              if (error) throw error
            }
            if (dels.length) {
              const { error } = await supabase.from('attendance').delete().eq('session_id', s.id).in('player_id', dels.map(([, i]) => i.playerId))
              if (error) throw error
            }
            for (const [k, i] of items) done[k] = i.t
          } catch (e) {
            const msg = (e as { message?: string })?.message ?? ''
            if (!navigator.onLine || /fetch|network|Failed/i.test(msg)) { networkDown = true; break }
            console.error('sync', e)
            notify(`Some marks for ${date} were rejected: ${msg}`)
            for (const [k, i] of items) done[k] = i.t // drop rejected changes so they don't retry forever
          }
        }
        if (Object.keys(done).length) {
          const next = { ...queueRef.current }
          for (const [k, t] of Object.entries(done)) if (next[k]?.t === t) delete next[k]
          saveQueue(next)
        }
        setOffline(networkDown)
        if (networkDown) break
      } while (flushAgain.current)
    } finally {
      flushing.current = false
    }
  }, [ensureSession, notify, saveQueue])

  useEffect(() => {
    reload().then(() => flush())
    const onVis = () => { if (document.visibilityState === 'visible') reload().then(() => flush()) }
    const onOnline = () => { flush().then(() => reload()) }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    const t = window.setInterval(() => { if (Object.keys(queueRef.current).length) flush() }, 15000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onOnline)
      window.clearInterval(t)
    }
  }, [reload, flush])

  // ---------- marks (offline-safe) ----------
  const queueMarks = useCallback((date: string, changes: { playerId: string; status: Status | null; note?: string | null }[]) => {
    const sid = sessionsRef.current.find((s) => s.date === date)?.id ?? `pending:${date}`
    setMarks((prev) => {
      const day = { ...(prev[sid] || {}) }
      for (const c of changes) {
        if (c.status) day[c.playerId] = { status: c.status, note: c.note !== undefined ? c.note : day[c.playerId]?.note ?? null, self: false }
        else delete day[c.playerId]
      }
      return { ...prev, [sid]: day }
    })
    const next = { ...queueRef.current }
    const t = Date.now()
    for (const c of changes) {
      const key = `${date}|${c.playerId}`
      const prevNote = next[key]?.note
      next[key] = { date, playerId: c.playerId, status: c.status, note: c.note !== undefined ? c.note : prevNote, t }
    }
    saveQueue(next)
    flush()
  }, [saveQueue, flush])

  const dayMarks = useCallback((date: string): Record<string, Mark> => {
    const sid = sessions.find((s) => s.date === date)?.id
    return { ...(marks[`pending:${date}`] || {}), ...(sid ? marks[sid] || {} : {}) }
  }, [sessions, marks])

  const setMark = useCallback((date: string, playerId: string, status: Status | null) => {
    if (!canEdit) return
    queueMarks(date, [{ playerId, status }])
  }, [canEdit, queueMarks])

  const markRest = useCallback((date: string, status: Status = 'P') => {
    if (!canEdit) return
    const sid = sessionsRef.current.find((s) => s.date === date)?.id
    const m = marksRef.current
    const day = { ...(m[`pending:${date}`] || {}), ...(sid ? m[sid] || {} : {}) }
    const todo = playersRef.current.filter((p) => p.active && !day[p.id])
    if (!todo.length) { notify('Everyone is already marked'); return }
    queueMarks(date, todo.map((p) => ({ playerId: p.id, status })))
    notify(`${todo.length} marked ${status === 'P' ? 'present' : 'absent'}`)
  }, [canEdit, queueMarks, notify])

  const setNote = useCallback((date: string, playerId: string, note: string) => {
    const cur = dayMarks(date)[playerId]
    if (!cur) { notify('Mark them first, then add a note'); return }
    queueMarks(date, [{ playerId, status: cur.status, note: note.trim().slice(0, 280) || null }])
  }, [dayMarks, queueMarks, notify])

  // ---------- online-only actions ----------
  const sessionFor = useCallback((date: string) => sessions.find((s) => s.date === date), [sessions])

  const patchSession = (id: string, patch: Partial<Session>) =>
    setSessions((prev) => { const n = prev.map((x) => (x.id === id ? { ...x, ...patch } : x)); sessionsRef.current = n; return n })

  const setKind = useCallback(async (date: string, kind: string) => {
    try {
      const s = await ensureSession(date)
      patchSession(s.id, { kind })
      const { error } = await supabase.from('sessions').update({ kind }).eq('id', s.id)
      if (error) throw error
    } catch (e) { fail('Session type', e); reload() }
  }, [ensureSession, fail, reload])

  const isRequired = useCallback((date: string) => {
    const s = sessions.find((x) => x.date === date)
    return s ? s.required : trainingDays.includes(weekday(date))
  }, [sessions, trainingDays])

  const setRequired = useCallback(async (date: string, required: boolean) => {
    try {
      const s = await ensureSession(date)
      patchSession(s.id, { required })
      const { error } = await supabase.from('sessions').update({ required }).eq('id', s.id)
      if (error) throw error
      notify(required ? 'Now a training day' : 'Now a normal day')
    } catch (e) { fail('That change', e); reload() }
  }, [ensureSession, notify, fail, reload])

  const deleteSession = useCallback(async (date: string) => {
    const s = sessionsRef.current.find((x) => x.date === date)
    const next = { ...queueRef.current }
    for (const k of Object.keys(next)) if (next[k].date === date) delete next[k]
    saveQueue(next)
    setMarks((prev) => { const n = { ...prev }; delete n[`pending:${date}`]; if (s) delete n[s.id]; return n })
    if (!s) return
    const { error } = await supabase.from('sessions').delete().eq('id', s.id)
    if (error) { fail('Clearing the session', error); reload(); return }
    setSessions((prev) => prev.filter((x) => x.id !== s.id))
    notify('Session cleared')
  }, [fail, notify, reload, saveQueue])

  const openCheckin = useCallback(async (date: string, lateAfter: string | null) => {
    try {
      const s = await ensureSession(date)
      const code = s.checkin_code && s.checkin_until && new Date(s.checkin_until) > new Date() ? s.checkin_code : randomCode()
      const until = new Date(Date.now() + 4 * 3600 * 1000).toISOString()
      const patch = { checkin_code: code, checkin_until: until, late_after: lateAfter }
      const { error } = await supabase.from('sessions').update(patch).eq('id', s.id)
      if (error) throw error
      patchSession(s.id, patch)
      return { ...s, ...patch }
    } catch (e) { fail('Opening check-in', e); return null }
  }, [ensureSession, fail])

  const closeCheckin = useCallback(async (date: string) => {
    const s = sessionsRef.current.find((x) => x.date === date)
    if (!s) return
    const patch = { checkin_until: new Date().toISOString() }
    const { error } = await supabase.from('sessions').update(patch).eq('id', s.id)
    if (error) { fail('Closing check-in', error); return }
    patchSession(s.id, patch)
    notify('Check-in closed')
  }, [fail, notify])

  const setTrainingDays = useCallback(async (days: number[]) => {
    const before = daysRef.current
    const sorted = [...days].sort()
    setDays(sorted)
    const { error } = await supabase.from('settings').upsert({ owner: clubRef.current.owner, training_days: sorted, updated_at: new Date().toISOString() }, { onConflict: 'owner' })
    if (error) { setDays(before); fail('Training days', error) }
  }, [fail])

  const setClubName = useCallback(async (name: string) => {
    const clean = name.trim().slice(0, 60)
    if (!clean) return
    setClubNameState(clean)
    const { error } = await supabase.from('settings').upsert({ owner: clubRef.current.owner, club_name: clean, updated_at: new Date().toISOString() }, { onConflict: 'owner' })
    if (error) fail('Club name', error)
    else notify('Club name saved')
  }, [fail, notify])

  const saveCourt = useCallback(async (patch: Partial<Court>) => {
    const before = court
    const next = { ...court, ...patch }
    setCourt(next)
    const row: Record<string, unknown> = { owner: clubRef.current.owner, updated_at: new Date().toISOString() }
    if ('lat' in patch) row.court_lat = patch.lat
    if ('lng' in patch) row.court_lng = patch.lng
    if ('radius' in patch) row.court_radius_m = patch.radius
    if ('start' in patch) row.checkin_start = patch.start
    if ('end' in patch) row.checkin_end = patch.end
    if ('late' in patch) row.checkin_late = patch.late
    const { error } = await supabase.from('settings').upsert(row, { onConflict: 'owner' })
    if (error) { setCourt(before); fail('Court settings', error); return false }
    return true
  }, [court, fail])

  const newCourtCode = useCallback(async () => {
    const code = randomCode(12)
    const { error } = await supabase.from('settings').upsert({ owner: clubRef.current.owner, court_code: code, updated_at: new Date().toISOString() }, { onConflict: 'owner' })
    if (error) { fail('New QR code', error); return }
    setCourt((c) => ({ ...c, code }))
    notify('New QR code made. Print the new poster; the old one stops working.')
  }, [fail, notify])

  const approve = useCallback(async (date: string, playerId: string) => {
    const s = sessionsRef.current.find((x) => x.date === date)
    if (!s) return
    setMarks((prev) => ({ ...prev, [s.id]: { ...(prev[s.id] || {}), [playerId]: { ...prev[s.id][playerId], pending: false } } }))
    const { error } = await supabase.from('attendance').update({ needs_ok: false }).eq('session_id', s.id).eq('player_id', playerId)
    if (error) { fail('Approving', error); reload() }
  }, [fail, reload])

  const addPlayers = useCallback(async (rows: { name: string; number: string | null; position: string | null }[]) => {
    if (!rows.length) return 0
    const { data, error } = await supabase.from('players').insert(rows.map((r) => ({ ...r, owner: clubRef.current.owner }))).select('id,name,number,position,active,created_at')
    if (error) { fail('Adding players', error); return 0 }
    setPlayers((prev) => [...prev, ...(data as Player[])].sort(byNumberThenName))
    return data.length
  }, [fail])

  const updatePlayer = useCallback(async (id: string, patch: Partial<Pick<Player, 'name' | 'number' | 'position' | 'active'>>) => {
    const before = playersRef.current.find((p) => p.id === id)
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort(byNumberThenName))
    const { error } = await supabase.from('players').update(patch).eq('id', id)
    if (error && before) {
      setPlayers((prev) => prev.map((p) => (p.id === id ? before : p)).sort(byNumberThenName))
      fail('Player changes', error)
    }
  }, [fail])

  const deletePlayer = useCallback(async (id: string) => {
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) { fail('Deleting the player', error); return }
    setPlayers((prev) => prev.filter((p) => p.id !== id))
    setMarks((prev) => {
      const n: Marks = {}
      for (const sid of Object.keys(prev)) { const d = { ...prev[sid] }; delete d[id]; n[sid] = d }
      return n
    })
    notify('Player deleted')
  }, [fail, notify])

  const addCoach = useCallback(async (email: string, role: 'viewer' | 'editor') => {
    const { data, error } = await supabase.rpc('add_coach', { p_email: email, p_role: role })
    if (error) { notify(error.message); return false }
    const c = data as Coach
    setCoaches((prev) => [...prev.filter((x) => x.coach !== c.coach), c])
    notify(`${c.coach_email} added as ${role === 'editor' ? 'a coach who can mark' : 'a viewer'}`)
    return true
  }, [notify])

  const removeCoach = useCallback(async (coachId: string) => {
    const { error } = await supabase.from('coaches').delete().eq('owner', userId).eq('coach', coachId)
    if (error) { fail('Removing the coach', error); return }
    setCoaches((prev) => prev.filter((c) => c.coach !== coachId))
    notify('Access removed')
  }, [userId, fail, notify])

  // ---------- stats ----------
  const statsCache = useMemo(() => {
    const out: Record<string, Stats> = {}
    for (const p of players) out[p.id] = { ...emptyTally(), normal: emptyTally() }
    const req: Record<string, boolean> = {}
    for (const s of sessions) req[s.id] = s.required
    for (const sid of Object.keys(marks)) {
      const required = sid.startsWith('pending:') ? trainingDays.includes(weekday(sid.slice(8))) : req[sid] ?? true
      for (const [pid, m] of Object.entries(marks[sid])) {
        const s = out[pid]
        if (!s || m.pending) continue
        if (required) s[m.status]++
        else s.normal[m.status]++
      }
    }
    for (const s of Object.values(out)) { finishTally(s); finishTally(s.normal) }
    return out
  }, [players, marks, sessions, trainingDays])

  const statsFor = useCallback(
    (id: string) => statsCache[id] ?? { ...emptyTally(), normal: emptyTally() },
    [statsCache],
  )

  const value: Store = {
    loading, error, offline, pendingCount: Object.keys(queue).length,
    club, canEdit, clubName, setClubName, court, saveCourt, newCourtCode, approve,
    players, activePlayers: players.filter((p) => p.active),
    sessions, marks, trainingDays, setTrainingDays, isRequired, setRequired,
    sessionFor, dayMarks, statsFor,
    setMark, setNote, markRest, setKind, deleteSession, openCheckin, closeCheckin,
    addPlayers, updatePlayer, deletePlayer,
    coaches, addCoach, removeCoach,
    reload, toast, notify,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

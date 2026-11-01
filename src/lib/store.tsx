import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { DEFAULT_TRAINING_DAYS, emptyTally, finishTally, type Mark, type Player, type Session, type Stats, type Status } from './types'
import { weekday } from './dates'

type Marks = Record<string, Record<string, Mark>> // sessionId -> playerId -> mark

interface Store {
  loading: boolean
  error: string | null
  players: Player[]
  activePlayers: Player[]
  sessions: Session[] // sorted ascending by date
  marks: Marks
  trainingDays: number[]
  setTrainingDays: (days: number[]) => Promise<void>
  isRequired: (date: string) => boolean
  setRequired: (date: string, required: boolean) => Promise<void>
  sessionFor: (date: string) => Session | undefined
  dayMarks: (date: string) => Record<string, Mark>
  statsFor: (playerId: string) => Stats
  setMark: (date: string, playerId: string, status: Status | null) => void
  setNote: (date: string, playerId: string, note: string) => Promise<void>
  markRest: (date: string, status?: Status) => void
  setKind: (date: string, kind: string) => Promise<void>
  deleteSession: (date: string) => Promise<void>
  addPlayers: (rows: { name: string; number: string | null; position: string | null }[]) => Promise<number>
  updatePlayer: (id: string, patch: Partial<Pick<Player, 'name' | 'number' | 'position' | 'active'>>) => Promise<void>
  deletePlayer: (id: string) => Promise<void>
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

function byName(a: Player, b: Player) {
  const na = parseInt(a.number ?? '', 10)
  const nb = parseInt(b.number ?? '', 10)
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
  if (isNaN(na) !== isNaN(nb)) return isNaN(na) ? 1 : -1
  return a.name.localeCompare(b.name)
}

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [marks, setMarks] = useState<Marks>({})
  const [trainingDays, setDays] = useState<number[]>(DEFAULT_TRAINING_DAYS)
  const daysRef = useRef<number[]>(DEFAULT_TRAINING_DAYS)
  daysRef.current = trainingDays
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const pending = useRef<Record<string, Promise<Session>>>({})
  const sessionsRef = useRef<Session[]>([])
  sessionsRef.current = sessions
  const playersRef = useRef<Player[]>([])
  playersRef.current = players

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const fail = useCallback((what: string, e: unknown) => {
    console.error(what, e)
    notify(`${what} didn't save. Check your connection and try again.`)
  }, [notify])

  const reload = useCallback(async () => {
    setError(null)
    const [p, s, a, cfg] = await Promise.all([
      supabase.from('players').select('id,name,number,position,active,created_at'),
      supabase.from('sessions').select('id,date,kind,required').order('date'),
      supabase.from('attendance').select('session_id,player_id,status,note'),
      supabase.from('settings').select('training_days').maybeSingle(),
    ])
    const err = p.error || s.error || a.error
    if (!cfg.error && cfg.data) setDays((cfg.data as { training_days: number[] }).training_days)
    if (err) {
      setError('Could not load your squad. Check your connection, then pull to refresh.')
      setLoading(false)
      return
    }
    setPlayers((p.data as Player[]).sort(byName))
    setSessions(s.data as Session[])
    const m: Marks = {}
    for (const r of a.data as { session_id: string; player_id: string; status: Status; note: string | null }[]) {
      ;(m[r.session_id] ||= {})[r.player_id] = { status: r.status, note: r.note }
    }
    setMarks(m)
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    const onVis = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [reload])

  const sessionFor = useCallback((date: string) => sessions.find((s) => s.date === date), [sessions])

  const dayMarks = useCallback((date: string): Record<string, Mark> => {
    const sid = sessions.find((s) => s.date === date)?.id
    return { ...(marks[`pending:${date}`] || {}), ...(sid ? marks[sid] || {} : {}) }
  }, [sessions, marks])

  const ensureSession = useCallback(async (date: string): Promise<Session> => {
    const existing = sessionsRef.current.find((s) => s.date === date)
    if (existing) return existing
    if (date in pending.current) return pending.current[date]
    const p = (async () => {
      const { data, error } = await supabase
        .from('sessions')
        .upsert({ date, owner: userId, required: daysRef.current.includes(weekday(date)) }, { onConflict: 'owner,date' })
        .select('id,date,kind,required')
        .single()
      if (error) throw error
      const s = data as Session
      setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s].sort((a, b) => a.date.localeCompare(b.date))))
      return s
    })()
    pending.current[date] = p
    try { return await p } finally { delete pending.current[date] }
  }, [userId])

  const applyLocal = (sessionId: string, playerId: string, mark: Mark | null) => {
    setMarks((prev) => {
      const day = { ...(prev[sessionId] || {}) }
      if (mark) day[playerId] = mark
      else delete day[playerId]
      return { ...prev, [sessionId]: day }
    })
  }

  const setMark = useCallback((date: string, playerId: string, status: Status | null) => {
    const tempKey = `pending:${date}`
    const known = sessionsRef.current.find((s) => s.date === date)
    const sid = known?.id ?? tempKey
    const prevMark = marks[sid]?.[playerId] ?? null
    applyLocal(sid, playerId, status ? { status, note: prevMark?.note ?? null } : null)
    ;(async () => {
      try {
        const s = await ensureSession(date)
        if (!known) {
          // move optimistic marks from temp key to the real session id
          setMarks((prev) => {
            const tmp = prev[tempKey]
            if (!tmp) return prev
            const next = { ...prev, [s.id]: { ...(prev[s.id] || {}), ...tmp } }
            delete next[tempKey]
            return next
          })
        }
        if (status) {
          const { error } = await supabase
            .from('attendance')
            .upsert({ session_id: s.id, player_id: playerId, owner: userId, status, updated_at: new Date().toISOString() }, { onConflict: 'session_id,player_id' })
          if (error) throw error
        } else {
          const { error } = await supabase.from('attendance').delete().match({ session_id: s.id, player_id: playerId })
          if (error) throw error
        }
      } catch (e) {
        const realId = sessionsRef.current.find((s) => s.date === date)?.id ?? sid
        applyLocal(realId, playerId, prevMark)
        fail('That mark', e)
      }
    })()
  }, [marks, ensureSession, userId, fail])

  const markRest = useCallback((date: string, status: Status = 'P') => {
    const sid = sessionsRef.current.find((s) => s.date === date)?.id
    const day = { ...(marks[`pending:${date}`] || {}), ...(sid ? marks[sid] || {} : {}) }
    const todo = playersRef.current.filter((p) => p.active && !day[p.id])
    if (!todo.length) { notify('Everyone is already marked'); return }
    const word = status === 'P' ? 'present' : 'absent'
    ;(async () => {
      try {
        const s = await ensureSession(date)
        setMarks((prev) => {
          const d = { ...(prev[s.id] || {}) }
          todo.forEach((p) => { d[p.id] = { status, note: null } })
          return { ...prev, [s.id]: d }
        })
        const { error } = await supabase.from('attendance').upsert(
          todo.map((p) => ({ session_id: s.id, player_id: p.id, owner: userId, status })),
          { onConflict: 'session_id,player_id' },
        )
        if (error) throw error
        notify(`${todo.length} marked ${word}`)
      } catch (e) {
        fail(`Marking ${word}`, e)
        reload()
      }
    })()
  }, [marks, ensureSession, userId, notify, fail, reload])

  const setNote = useCallback(async (date: string, playerId: string, note: string) => {
    const s = sessionsRef.current.find((x) => x.date === date)
    const cur = s ? marks[s.id]?.[playerId] : undefined
    if (!s || !cur) { notify('Mark them first, then add a note'); return }
    const clean = note.trim().slice(0, 280) || null
    applyLocal(s.id, playerId, { ...cur, note: clean })
    const { error } = await supabase.from('attendance').update({ note: clean }).match({ session_id: s.id, player_id: playerId })
    if (error) { applyLocal(s.id, playerId, cur); fail('The note', error) }
  }, [marks, notify, fail])

  const setKind = useCallback(async (date: string, kind: string) => {
    try {
      const s = await ensureSession(date)
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, kind } : x)))
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
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, required } : x)))
      const { error } = await supabase.from('sessions').update({ required }).eq('id', s.id)
      if (error) throw error
      notify(required ? 'Now a training day' : 'Now a normal day')
    } catch (e) { fail('That change', e); reload() }
  }, [ensureSession, notify, fail, reload])

  const setTrainingDays = useCallback(async (days: number[]) => {
    const before = daysRef.current
    const sorted = [...days].sort()
    setDays(sorted)
    const { error } = await supabase.from('settings').upsert({ owner: userId, training_days: sorted, updated_at: new Date().toISOString() }, { onConflict: 'owner' })
    if (error) { setDays(before); fail('Training days', error) }
  }, [userId, fail])

  const deleteSession = useCallback(async (date: string) => {
    const s = sessionsRef.current.find((x) => x.date === date)
    if (!s) return
    const { error } = await supabase.from('sessions').delete().eq('id', s.id)
    if (error) { fail('Clearing the session', error); return }
    setSessions((prev) => prev.filter((x) => x.id !== s.id))
    setMarks((prev) => { const n = { ...prev }; delete n[s.id]; return n })
    notify('Session cleared')
  }, [fail, notify])

  const addPlayers = useCallback(async (rows: { name: string; number: string | null; position: string | null }[]) => {
    if (!rows.length) return 0
    const { data, error } = await supabase.from('players').insert(rows.map((r) => ({ ...r, owner: userId }))).select('id,name,number,position,active,created_at')
    if (error) { fail('Adding players', error); return 0 }
    setPlayers((prev) => [...prev, ...(data as Player[])].sort(byName))
    return data.length
  }, [userId, fail])

  const updatePlayer = useCallback(async (id: string, patch: Partial<Pick<Player, 'name' | 'number' | 'position' | 'active'>>) => {
    const before = playersRef.current.find((p) => p.id === id)
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort(byName))
    const { error } = await supabase.from('players').update(patch).eq('id', id)
    if (error && before) {
      setPlayers((prev) => prev.map((p) => (p.id === id ? before : p)).sort(byName))
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

  const statsCache = useMemo(() => {
    const out: Record<string, Stats> = {}
    for (const p of players) out[p.id] = { ...emptyTally(), normal: emptyTally() }
    const req: Record<string, boolean> = {}
    for (const s of sessions) req[s.id] = s.required
    for (const sid of Object.keys(marks)) {
      const required = sid.startsWith('pending:') ? trainingDays.includes(weekday(sid.slice(8))) : req[sid] ?? true
      for (const [pid, m] of Object.entries(marks[sid])) {
        const s = out[pid]
        if (!s) continue
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
    loading, error, players,
    activePlayers: players.filter((p) => p.active),
    sessions, marks, sessionFor, dayMarks, statsFor,
    trainingDays, setTrainingDays, isRequired, setRequired,
    setMark, setNote, markRest, setKind, deleteSession,
    addPlayers, updatePlayer, deletePlayer, reload, toast, notify,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

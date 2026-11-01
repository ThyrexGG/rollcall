export type Status = 'P' | 'L' | 'E' | 'A'

export const STATUSES: Status[] = ['P', 'L', 'E', 'A']
export const STATUS_LABEL: Record<Status, string> = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' }

export const POSITIONS = ['Setter', 'Outside', 'Opposite', 'Middle', 'Libero', 'Defensive specialist']
export const SESSION_KINDS = ['Training', 'Match', 'Friendly', 'Conditioning', 'Tournament']

export interface Player {
  id: string
  name: string
  number: string | null
  position: string | null
  active: boolean
  created_at: string
}

export interface Session {
  id: string
  date: string // YYYY-MM-DD
  kind: string
  required: boolean // training day (true) or normal day (false)
  checkin_code: string | null
  checkin_until: string | null
  late_after: string | null // "HH:MM:SS"
}

export type Role = 'owner' | 'editor' | 'viewer'

export interface Coach {
  coach: string
  coach_email: string
  role: 'viewer' | 'editor'
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DEFAULT_TRAINING_DAYS = [2, 5] // Tuesday, Friday

export interface Mark {
  status: Status
  note: string | null
  self?: boolean // player checked themselves in by QR
  pending?: boolean // QR check-in the coach still has to confirm (no location / weak GPS)
  distance?: number | null // metres from court at check-in
  flag?: 'court_not_set' | 'no_location' | 'weak_gps' | 'different_player' | null
}

/** Printed court QR settings. Times are "HH:MM". */
export interface Court {
  code: string | null
  lat: number | null
  lng: number | null
  radius: number
  start: string
  end: string
  late: string | null
}

export interface Tally {
  P: number
  L: number
  E: number
  A: number
  /** P + L + A (excused never counts) */
  counted: number
  /** (P + L) / counted, rounded; null when nothing counted yet */
  pct: number | null
}

/** Training days (Tue/Fri by default) and normal days are tracked separately. */
export interface Stats extends Tally {
  normal: Tally
}

export function emptyTally(): Tally {
  return { P: 0, L: 0, E: 0, A: 0, counted: 0, pct: null }
}
export function finishTally(t: Tally): Tally {
  t.counted = t.P + t.L + t.A
  t.pct = t.counted ? Math.round(((t.P + t.L) / t.counted) * 100) : null
  return t
}

/** Attendance % = (present + late) / (present + late + absent). Excused never counts against. */
export const FOLLOW_UP = 70
export const WATCH = 80

export function level(pct: number | null): 'none' | 'ok' | 'watch' | 'low' {
  if (pct === null) return 'none'
  if (pct < FOLLOW_UP) return 'low'
  if (pct < WATCH) return 'watch'
  return 'ok'
}

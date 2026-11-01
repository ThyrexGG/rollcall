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
  required: boolean // counts toward attendance %
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DEFAULT_TRAINING_DAYS = [2, 5] // Tuesday, Friday

export interface Mark {
  status: Status
  note: string | null
}

export interface Stats {
  P: number
  L: number
  E: number
  A: number
  counted: number
  pct: number | null
  /** optional sessions attended (present or late), never part of pct */
  extra: number
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

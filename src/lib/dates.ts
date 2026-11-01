export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function today(): string {
  return iso(new Date())
}
export function addDays(s: string, n: number): string {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export function fmtDay(s: string): string {
  return parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
export function fmtMonth(s: string): string {
  return parse(s).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}
export function weekday(s: string): number {
  return parse(s).getDay()
}
/** Nearest training day strictly before (dir -1) or after (dir 1) the date. */
export function stepTrainingDay(s: string, days: number[], dir: 1 | -1): string {
  if (!days.length) return addDays(s, dir)
  let d = s
  for (let i = 0; i < 7; i++) {
    d = addDays(d, dir)
    if (days.includes(weekday(d))) return d
  }
  return addDays(s, dir)
}
/** Today if it is a training day, else the most recent training day. */
export function currentTrainingDay(days: number[]): string {
  const t = today()
  return !days.length || days.includes(weekday(t)) ? t : stepTrainingDay(t, days, -1)
}
export function fmtShort(s: string): string {
  return parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

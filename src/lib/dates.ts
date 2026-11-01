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
export function fmtShort(s: string): string {
  return parse(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

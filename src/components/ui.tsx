import { useEffect, useRef, type ReactNode } from 'react'
import type { Player } from '../lib/types'

const s = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const Icon = {
  back: () => <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>,
  next: () => <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>,
  plus: () => <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth="2.4" {...s} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  today: () => <svg width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.9" {...s} aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12.5l3 3 5-6" /></svg>,
  squad: () => <svg width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.9" {...s} aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.3 2.9-5 5.5-5s4.9 1.7 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.6-.2 4.2 1.4 4.6 4.3" /></svg>,
  history: () => <svg width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.9" {...s} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  download: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  alert: () => <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>,
  note: () => <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></svg>,
  qr: () => <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1" /><path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17.5 17.5h3v3h-3z" /></svg>,
  send: () => <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M21 4L3 11.5l6.5 2.5L12 20.5l3-5.5L21 4z" /><path d="M9.5 14L21 4" /></svg>,
  search: () => <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>,
  sync: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></svg>,
  flame: () => <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.4 2.4-5.4 4-7.4.4 1.8 1.4 3 2.6 3.6C11.4 7.4 12.6 5 15 3c.2 3 4 5.5 4 10.9C19 18.2 15.9 21 12 21z" /></svg>,
  close: () => <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="2" {...s} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  ball: (p: { size?: number }) => (
    <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 100 100" strokeWidth="5" {...s} aria-hidden="true">
      <circle cx="50" cy="50" r="44" /><path d="M50 6c-10 18-10 46 6 70M8 34c22-4 46 4 62 26M30 92c4-22 22-40 50-48" />
    </svg>
  ),
}

export function Jersey({ p, size = 36 }: { p: Pick<Player, 'number' | 'name'>; size?: number }) {
  const label = p.number || p.name.charAt(0).toUpperCase()
  return <span className="jersey" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{label}</span>
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      aria-label={title}
    >
      <div className="sheet-in">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn ghost" type="button" onClick={onClose} aria-label="Close"><Icon.close /></button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export function Toast({ msg }: { msg: string | null }) {
  return <div className={`toast${msg ? ' show' : ''}`} role="status" aria-live="polite">{msg}</div>
}

/** Two-tap confirm button, no browser dialogs. */
export function ConfirmButton({ label, confirm, onConfirm, className }: { label: string; confirm: string; onConfirm: () => void; className?: string }) {
  const armed = useRef(false)
  const btn = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  return (
    <button
      ref={btn}
      type="button"
      className={className}
      onClick={() => {
        if (armed.current) { window.clearTimeout(timer.current); armed.current = false; onConfirm(); return }
        armed.current = true
        if (btn.current) { btn.current.textContent = confirm; btn.current.classList.add('armed') }
        timer.current = window.setTimeout(() => {
          armed.current = false
          if (btn.current) { btn.current.textContent = label; btn.current.classList.remove('armed') }
        }, 3000)
      }}
    >{label}</button>
  )
}

import { useEffect, useState } from 'react'

export type Route =
  | { tab: 'today'; date?: string }
  | { tab: 'squad'; add?: boolean }
  | { tab: 'history' }
  | { tab: 'player'; id: string }

function parseHash(h: string): Route {
  const v = h.replace(/^#/, '')
  if (v === 'squad') return { tab: 'squad' }
  if (v === 'squad-add') return { tab: 'squad', add: true }
  if (v === 'history') return { tab: 'history' }
  if (v.startsWith('player-')) return { tab: 'player', id: v.slice(7) }
  if (/^day-\d{4}-\d{2}-\d{2}$/.test(v)) return { tab: 'today', date: v.slice(4) }
  return { tab: 'today' }
}

export function go(tab: 'today' | 'squad' | 'history' | 'player', arg?: string) {
  const h = tab === 'player' ? `#player-${arg}`
    : tab === 'squad' && arg === 'add' ? '#squad-add'
    : tab === 'today' && arg ? `#day-${arg}`
    : `#${tab}`
  if (location.hash !== h) location.hash = h
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => { setR(parseHash(location.hash)); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

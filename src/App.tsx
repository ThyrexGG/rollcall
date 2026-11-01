import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { StoreProvider, useStore } from './lib/store'
import { currentTrainingDay } from './lib/dates'
import { go, useRoute } from './router'
import { Icon, Toast } from './components/ui'
import { SignIn } from './screens/SignIn'
import { Today } from './screens/Today'
import { Squad } from './screens/Squad'
import { Player } from './screens/Player'
import { History } from './screens/History'

export default function App() {
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAuth(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (auth === undefined) return <Splash />
  if (!auth) return <SignIn />
  return (
    <StoreProvider key={auth.user.id} userId={auth.user.id}>
      <Shell email={auth.user.email ?? ''} />
    </StoreProvider>
  )
}

function Splash() {
  return <div className="splash" aria-label="Loading"><span className="logo">R</span></div>
}

function Shell({ email }: { email: string }) {
  const st = useStore()
  const route = useRoute()
  const [picked, setDate] = useState<string | null>(null)
  const date = picked ?? currentTrainingDay(st.trainingDays)

  useEffect(() => { if (route.tab === 'today' && route.date) setDate(route.date) }, [route])

  if (st.loading) return <Splash />

  const tab = route.tab === 'player' ? 'squad' : route.tab
  return (
    <>
      {st.error && (
        <div className="offline" role="alert">
          <span>{st.error}</span>
          <button type="button" className="pill-btn accent" onClick={() => st.reload()}>Retry</button>
        </div>
      )}
      {route.tab === 'today' && <Today date={date} setDate={(d) => { setDate(d); if (location.hash.startsWith('#day-')) history.replaceState(null, '', '#today') }} />}
      {route.tab === 'squad' && <Squad openAdd={!!route.add} />}
      {route.tab === 'player' && <Player id={route.id} />}
      {route.tab === 'history' && <History email={email} />}

      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-in">
          <button type="button" className="tab" aria-current={tab === 'today' ? 'page' : undefined} onClick={() => go('today')}><Icon.today />Today</button>
          <button type="button" className="tab" aria-current={tab === 'squad' ? 'page' : undefined} onClick={() => go('squad')}><Icon.squad />Squad</button>
          <button type="button" className="tab" aria-current={tab === 'history' ? 'page' : undefined} onClick={() => go('history')}><Icon.history />History</button>
        </div>
      </nav>
      <Toast msg={st.toast} />
    </>
  )
}

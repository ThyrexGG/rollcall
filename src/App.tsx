import { useEffect, useState } from 'react'
import type { Session as AuthSession } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { StoreProvider, useStore } from './lib/store'
import { currentTrainingDay } from './lib/dates'
import { go, useRoute } from './router'
import { Icon, Toast, Logo } from './components/ui'
import { SignIn, NewPassword } from './screens/SignIn'
import { Today } from './screens/Today'
import { Squad } from './screens/Squad'
import { Player } from './screens/Player'
import { History } from './screens/History'
import { CourtCheckIn } from './screens/CourtCheckIn'
import { setupPushListeners, isNative } from './lib/push'
import { App as NativeApp } from '@capacitor/app'
import { Poster } from './screens/Poster'

export default function App() {
  const route = useRoute()
  const [auth, setAuth] = useState<AuthSession | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setAuth(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Players scanning a QR code never need an account.
  if (route.tab === 'court') return <CourtCheckIn code={route.code} />

  if (auth === undefined) return <Splash />
  if (recovering && auth) return <NewPassword done={() => setRecovering(false)} />
  if (!auth) return <SignIn />
  return (
    <StoreProvider key={auth.user.id} userId={auth.user.id}>
      <Shell email={auth.user.email ?? ''} />
    </StoreProvider>
  )
}

function Splash() {
  return <div className="splash" aria-label="Loading"><Logo size={72} /></div>
}

function Shell({ email }: { email: string }) {
  const st = useStore()
  const route = useRoute()
  const [picked, setDate] = useState<string | null>(null)
  const date = picked ?? currentTrainingDay(st.trainingDays)

  useEffect(() => { if (route.tab === 'today' && route.date) setDate(route.date) }, [route])

  useEffect(() => {
    setupPushListeners((d) => { if (d) setDate(d); go('today') }, (title) => { st.notify(title); st.reload() })
    if (!isNative) return
    const h = NativeApp.addListener('backButton', ({ canGoBack }) => { if (canGoBack && location.hash && location.hash !== '#today') history.back(); else NativeApp.minimizeApp() })
    return () => { h.then((x) => x.remove()) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (st.loading) return <Splash />
  if (route.tab === 'poster') return <><Poster /><Toast msg={st.toast} /></>

  const tab = route.tab === 'player' ? 'squad' : route.tab
  return (
    <>
      {st.error && (
        <div className="offline" role="alert">
          <span>{st.error}</span>
          <button type="button" className="pill-btn accent" onClick={() => st.reload()}>Retry</button>
        </div>
      )}
      {!st.error && (st.offline || st.pendingCount > 0) && (
        <div className={`syncbar${st.offline ? ' off' : ''}`} role="status">
          <Icon.sync />
          <span>
            {st.offline ? 'Offline. ' : ''}
            {st.pendingCount
              ? `${st.pendingCount} change${st.pendingCount === 1 ? '' : 's'} saved on this phone, will sync when you’re back online.`
              : 'Showing saved data. Marks you make are kept and sync later.'}
          </span>
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

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

/** Push only exists in the Android app, and only in builds that include the Firebase config. */
export const isNative = Capacitor.isNativePlatform()
export const pushAvailable = isNative && import.meta.env.VITE_PUSH === '1'

let listenersReady = false

export async function setupPushListeners(onOpen: (date: string) => void, onForeground: (title: string) => void) {
  if (!pushAvailable || listenersReady) return
  listenersReady = true
  await PushNotifications.createChannel({ id: 'checkins', name: 'Check-ins', description: 'When players check in at the court', importance: 4, visibility: 1, vibration: true })
  await PushNotifications.addListener('pushNotificationReceived', (n) => onForeground(n.title ?? 'New check-in'))
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => onOpen((a.notification.data?.date as string) ?? ''))
}

/** Ask permission, get this phone's token and save it for the club. Resolves true when notifications are on. */
export async function enablePush(userId: string, clubOwner: string): Promise<boolean> {
  if (!pushAvailable) return false
  let perm = await PushNotifications.checkPermissions()
  if (perm.receive !== 'granted') perm = await PushNotifications.requestPermissions()
  if (perm.receive !== 'granted') return false
  const token = await new Promise<string>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), 15000)
    PushNotifications.addListener('registration', (r) => { window.clearTimeout(t); resolve(r.value) })
    PushNotifications.addListener('registrationError', (e) => { window.clearTimeout(t); reject(new Error(e.error)) })
    PushNotifications.register()
  })
  const { error } = await supabase.from('push_tokens').upsert(
    { token, user_id: userId, club_owner: clubOwner, platform: 'android', enabled: true, updated_at: new Date().toISOString() },
    { onConflict: 'token' })
  if (error) throw error
  try { localStorage.setItem('rollcall-push-token', token) } catch { /* ignore */ }
  return true
}

export async function disablePush(): Promise<void> {
  let token: string | null = null
  try { token = localStorage.getItem('rollcall-push-token') } catch { /* ignore */ }
  if (token) await supabase.from('push_tokens').update({ enabled: false }).eq('token', token)
  try { localStorage.removeItem('rollcall-push-token') } catch { /* ignore */ }
  if (pushAvailable) await PushNotifications.unregister().catch(() => undefined)
}

export function pushIsOn(): boolean {
  try { return !!localStorage.getItem('rollcall-push-token') } catch { return false }
}

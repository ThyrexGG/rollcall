// Sends a push to the club's coaches when a player checks themselves in at the court.
// Called by the attendance insert trigger (public.notify_checkin) with a shared secret.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

let cachedToken: { value: string; exp: number } | null = null

function b64url(data: ArrayBuffer | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.value
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  })
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${await res.text()}`)
  const j = await res.json()
  cachedToken = { value: j.access_token, exp: now + (j.expires_in ?? 3600) }
  return cachedToken.value
}

const WORD: Record<string, string> = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' }
const REASON: Record<string, string> = {
  different_player: 'phone belongs to someone else', no_location: 'location was off',
  weak_gps: 'GPS too weak', court_not_set: 'court location not saved',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const { data: secret } = await sb.from('app_secrets').select('value').eq('name', 'notify_webhook').single()
  if (!secret || req.headers.get('x-webhook-secret') !== secret.value) return new Response('unauthorized', { status: 401 })

  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return new Response(JSON.stringify({ skipped: 'FCM_SERVICE_ACCOUNT not set' }), { status: 200 })
  const sa = JSON.parse(raw) as ServiceAccount

  const ev = await req.json() as { session_id: string; player_id: string; owner: string; status: string; needs_ok: boolean; flag: string | null; new_phone: boolean }
  const [{ data: player }, { data: session }, { data: tokens }] = await Promise.all([
    sb.from('players').select('name').eq('id', ev.player_id).single(),
    sb.from('sessions').select('date').eq('id', ev.session_id).single(),
    sb.from('push_tokens').select('token').eq('club_owner', ev.owner).eq('enabled', true),
  ])
  if (!player || !tokens?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 })

  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Phnom_Penh' })
  const title = ev.needs_ok ? `${player.name} needs your OK` : `${player.name} checked in`
  const why = ev.new_phone ? 'new phone' : ev.flag ? REASON[ev.flag] ?? '' : ''
  const body = ev.needs_ok ? `${WORD[ev.status] ?? ev.status} at ${time} · ${why}. Open Today to approve.` : `${WORD[ev.status] ?? ev.status} at ${time}`

  const access = await googleAccessToken(sa)
  let sent = 0
  await Promise.all(tokens.map(async ({ token }) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { date: session?.date ?? '', needs_ok: String(ev.needs_ok) },
          android: {
            priority: 'high',
            notification: { channel_id: 'checkins', icon: 'ic_stat_rollcall', color: '#F5C518', tag: `${ev.session_id}-${ev.player_id}` },
          },
        },
      }),
    })
    if (res.ok) { sent++; return }
    const text = await res.text()
    if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) {
      await sb.from('push_tokens').update({ enabled: false }).eq('token', token)
    } else console.error('fcm', res.status, text)
  }))
  return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})

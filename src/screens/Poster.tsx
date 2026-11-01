import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useStore } from '../lib/store'
import { DAY_SHORT } from '../lib/types'
import { Icon } from '../components/ui'
import { go } from '../router'

export function courtUrl(code: string) {
  const base = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || location.origin
  return `${base}/#court-${code}`
}

/** A4 poster for the court wall. Sized in container units so it previews at any width and prints at exactly 210 × 297 mm. */
export function Poster() {
  const st = useStore()
  const c = st.court
  const [svg, setSvg] = useState('')
  const url = c.code ? courtUrl(c.code) : ''

  useEffect(() => {
    if (!url) return
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'H', color: { dark: '#0E1E33', light: '#FFFFFF' } }).then(setSvg)
  }, [url])

  const days = st.trainingDays.map((d) => DAY_SHORT[d].toUpperCase()).join(' & ') || 'ANY DAY'

  return (
    <div className="poster-page">
      <div className="poster-tools">
        <button type="button" className="pill-btn" onClick={() => go('history')}><Icon.back /> Back</button>
        <button type="button" className="pill-btn accent" onClick={() => window.print()}>Print or save PDF</button>
      </div>

      {!c.code ? (
        <p className="hint center-text">Make a court QR code in History first.</p>
      ) : (
        <article className="poster" aria-label="Check-in poster">
          <svg className="poster-court" viewBox="0 0 210 297" aria-hidden="true" preserveAspectRatio="none">
            <g fill="none" stroke="#1A3253" strokeWidth="0.8">
              <rect x="9" y="9" width="192" height="279" rx="2" />
            </g>
          </svg>
          <svg className="poster-ball" viewBox="0 0 100 100" aria-hidden="true">
            <g fill="none" stroke="#1C3354" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="50" cy="50" r="46" />
              <path d="M50 4c-10 18-10 46 6 70M8 34c22-4 46 4 62 26M30 92c4-22 22-40 50-48" />
            </g>
          </svg>

          <header className="poster-top">
            <span className="poster-brand"><span className="poster-logo">R</span>ROLLCALL</span>
            <span className="poster-club">{st.clubName}</span>
          </header>

          <h1 className="poster-title">SCAN<br />IN<span>.</span></h1>
          <p className="poster-sub">Training attendance. Takes five seconds.</p>

          <div className="poster-qr-wrap">
            <span className="vf tl" /><span className="vf tr" /><span className="vf bl" /><span className="vf br" />
            <div className="poster-qr">
              <div className="poster-qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
              <span className="poster-qr-badge" aria-hidden="true">R</span>
            </div>
          </div>

          <ol className="poster-steps">
            <li><span className="n">1</span><span><b>Scan</b> with your camera</span></li>
            <li><span className="n">2</span><span><b>Tap</b> your name</span></li>
            <li><span className="n">3</span><span><b>Allow</b> location</span></li>
          </ol>

          <footer className="poster-bar">
            <div><small>Training</small><b>{days}</b></div>
            <div><small>Check-in open</small><b>{c.start}–{c.end}</b></div>
            <div><small>Late after</small><b>{c.late ?? 'No limit'}</b></div>
          </footer>
          <p className="poster-fine">Works only at the court · One phone, one player</p>
        </article>
      )}
    </div>
  )
}

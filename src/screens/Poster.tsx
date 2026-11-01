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

/**
 * A4 court poster. Concept: the poster is the court seen from above. The opponent half bleeds off the top,
 * the net crosses the middle, the three steps stand in the front row (positions 4-3-2), and the QR code is
 * taped to the floor in the back court like a player's spot marker. Sized in container units so it previews
 * at any width and prints at exactly 210 × 297 mm.
 */
export function Poster() {
  const st = useStore()
  const c = st.court
  const [svg, setSvg] = useState('')
  const url = c.code ? courtUrl(c.code) : ''

  useEffect(() => {
    if (!url) return
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'H', color: { dark: '#0E1E33', light: '#FFFFFF' } }).then(setSvg)
  }, [url])

  const days = st.trainingDays.map((d) => DAY_SHORT[d].toUpperCase())

  return (
    <div className="poster-page">
      <div className="poster-tools">
        <button type="button" className="pill-btn" onClick={() => go('history')}><Icon.back /> Back</button>
        <button type="button" className="pill-btn accent" onClick={() => window.print()}>Print or save PDF</button>
      </div>

      {!c.code ? (
        <p className="hint center-text">Make a court QR code in History first.</p>
      ) : (
        <article className="pc" aria-label="Court check-in poster">
          <span className="pc-side left">{st.clubName}</span>
          <span className="pc-side right">Rollcall · attendance</span>

          <div className="pc-court">
            <div className="pc-opp">
              <p className="pc-kicker">Training check-in</p>
              <h1 className="pc-title">Here for<br />training?</h1>
            </div>

            <div className="pc-net" aria-hidden="true">
              <span className="pc-post l" /><span className="pc-post r" />
              <span className="pc-mesh" />
              <span className="pc-tape" />
            </div>

            <ol className="pc-front" aria-label="How to check in">
              <li><span className="pc-pos">1</span><b>Scan</b><small>with your camera</small></li>
              <li><span className="pc-pos">2</span><b>Tap</b><small>your name</small></li>
              <li><span className="pc-pos">3</span><b>Allow</b><small>your location</small></li>
            </ol>
            <span className="pc-attack" aria-hidden="true" />

            <div className="pc-spot">
              <div className="pc-marker">
                <span className="pc-tape-strip a" aria-hidden="true" />
                <span className="pc-tape-strip b" aria-hidden="true" />
                <div className="pc-qr" dangerouslySetInnerHTML={{ __html: svg }} />
                <span className="pc-ball" aria-hidden="true">
                  <svg viewBox="0 0 100 100"><g fill="none" stroke="#0E1E33" strokeWidth="7" strokeLinecap="round"><circle cx="50" cy="50" r="43" /><path d="M50 7c-10 18-10 44 6 66M10 35c21-4 43 4 58 25M31 91c4-21 21-38 47-46" /></g></svg>
                </span>
              </div>
              <p className="pc-spot-label">Take your spot. <span>Scan in.</span></p>
            </div>
          </div>

          <div className="pc-board">
            <div><small>Training</small><b>{days.join(' · ') || 'Any day'}</b></div>
            <div><small>Check-in</small><b>{c.start}<i>–</i>{c.end}</b></div>
            <div><small>Late after</small><b className="hot">{c.late ?? '—'}</b></div>
          </div>
          <p className="pc-fine">Works only on court · one phone, one player</p>
        </article>
      )}
    </div>
  )
}

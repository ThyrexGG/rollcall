import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const PHNOM_PENH: [number, number] = [11.5564, 104.9282]

const LAYERS = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  map: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
} as const

/**
 * Pull coordinates out of whatever people paste:
 * "11.5564, 104.9282", "11.5564 104.9282", Google Maps URLs with "@lat,lng", "q=lat,lng", "ll=lat,lng" or "!3dlat!4dlng".
 */
export function parseCoords(text: string): [number, number] | null {
  const t = text.trim()
  const tries = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/,
  ]
  for (const re of tries) {
    const m = t.match(re)
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2])
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng]
    }
  }
  return null
}

export default function CourtMapPicker({ lat, lng, radius, onSave, onCancel }: {
  lat: number | null
  lng: number | null
  radius: number
  onSave: (lat: number, lng: number) => void
  onCancel: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.TileLayer | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const [center, setCenter] = useState<[number, number]>(lat !== null && lng !== null ? [lat, lng] : PHNOM_PENH)
  const [kind, setKind] = useState<'satellite' | 'map'>('satellite')
  const [paste, setPaste] = useState('')
  const [pasteErr, setPasteErr] = useState<string | null>(null)

  useEffect(() => {
    if (!box.current || mapRef.current) return
    const start: [number, number] = lat !== null && lng !== null ? [lat, lng] : PHNOM_PENH
    const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(start, lat !== null ? 18 : 13)
    layerRef.current = L.tileLayer(LAYERS.satellite.url, { attribution: LAYERS.satellite.attribution, maxZoom: 19 }).addTo(map)
    circleRef.current = L.circle(start, { radius, color: '#F5C518', weight: 2, fillColor: '#F5C518', fillOpacity: 0.15, interactive: false }).addTo(map)
    map.on('move', () => {
      const c = map.getCenter()
      circleRef.current?.setLatLng(c)
      setCenter([c.lat, c.lng])
    })
    mapRef.current = map
    // the sheet animates in; recompute size once it has settled
    window.setTimeout(() => map.invalidateSize(), 250)
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { circleRef.current?.setRadius(radius) }, [radius])

  function switchLayer(k: 'satellite' | 'map') {
    setKind(k)
    const map = mapRef.current
    if (!map) return
    layerRef.current?.remove()
    layerRef.current = L.tileLayer(LAYERS[k].url, { attribution: LAYERS[k].attribution, maxZoom: 19 }).addTo(map)
  }

  function applyPaste() {
    const c = parseCoords(paste)
    if (!c) {
      setPasteErr(/goo\.gl|maps\.app/.test(paste)
        ? 'Short share links can’t be read. In Google Maps, long-press the court, then copy the numbers shown (like 11.5564, 104.9282).'
        : 'Couldn’t find coordinates. Paste something like 11.5564, 104.9282 or a full Google Maps link.')
      return
    }
    setPasteErr(null)
    mapRef.current?.setView(c, 18)
  }

  return (
    <div className="stack-12 picker">
      <p className="sheet-sub">Drag the map until the court is under the pin. The yellow ring shows how close players must be.</p>
      <div className="picker-map-wrap">
        <div ref={box} className="picker-map" />
        <span className="picker-pin" aria-hidden="true">
          <svg viewBox="0 0 24 36" width="32" height="48"><path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z" fill="#E2672B" stroke="#FFFFFF" strokeWidth="2" /><circle cx="12" cy="12" r="4.5" fill="#FFFFFF" /></svg>
        </span>
        <div className="picker-layers" role="group" aria-label="Map style">
          <button type="button" className={`chip${kind === 'satellite' ? ' on' : ''}`} aria-pressed={kind === 'satellite'} onClick={() => switchLayer('satellite')}>Satellite</button>
          <button type="button" className={`chip${kind === 'map' ? ' on' : ''}`} aria-pressed={kind === 'map'} onClick={() => switchLayer('map')}>Map</button>
        </div>
      </div>
      <p className="picker-coords">{center[0].toFixed(5)}, {center[1].toFixed(5)}</p>
      <form className="picker-paste" onSubmit={(e) => { e.preventDefault(); applyPaste() }}>
        <label className="field">
          <span>Or paste coordinates or a Google Maps link</span>
          <input id="court-paste" value={paste} onChange={(e) => { setPaste(e.target.value); setPasteErr(null) }} placeholder="11.5564, 104.9282" inputMode="text" />
        </label>
        <button type="submit" className="btn" disabled={!paste.trim()}>Go</button>
      </form>
      {pasteErr && <p className="form-msg err light" role="alert">{pasteErr}</p>}
      <div className="row-2">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => onSave(center[0], center[1])}>Set court here</button>
      </div>
    </div>
  )
}

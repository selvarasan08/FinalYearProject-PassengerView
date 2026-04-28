import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getBusesForStop } from '../services/Api';
import './StopPage.css';

/* ─── Leaflet icon fix ───────────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ═══════════════════════════════════════════════════════════════════
   MAP TILE LAYERS
   ═══════════════════════════════════════════════════════════════════ */
const MAP_STYLES = [
  {
    id: 'dark',
    label: 'Dark',
    icon: '🌑',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    filter: 'invert(1) hue-rotate(180deg) brightness(0.85) saturate(0.8)',
    extraLayer: null,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, Maxar, Earthstar Geographics',
    filter: 'none',
    extraLayer: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
  {
    id: 'street',
    label: 'Street',
    icon: '🗺️',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    filter: 'none',
    extraLayer: null,
  },
];

function TileLayerSwitcher({ style }) {
  return (
    <>
      <TileLayer key={style.id} url={style.url} attribution={style.attribution} />
      {style.extraLayer && (
        <TileLayer key={style.id + '-labels'} url={style.extraLayer} attribution="" />
      )}
    </>
  );
}

function MapStyleSwitcher({ current, onChange }) {
  const [open, setOpen] = useState(false);
  const currentStyle = MAP_STYLES.find(s => s.id === current) || MAP_STYLES[0];

  return (
    <div className="map-style-switcher" style={{ position: 'absolute', top: 10, right: 10, zIndex: 900 }}>
      <button
        className="map-style-btn"
        onClick={() => setOpen(o => !o)}
        title="Change map style"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          background: 'rgba(6,11,24,.92)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,159,10,.35)', borderRadius: '10px',
          padding: '.38rem .7rem', cursor: 'pointer', color: '#fff',
          fontSize: '.7rem', fontWeight: 700, fontFamily: 'var(--mono)',
          boxShadow: '0 4px 16px rgba(0,0,0,.5)',
          transition: 'all .18s', whiteSpace: 'nowrap', letterSpacing: '.03em',
        }}
      >
        <span style={{ fontSize: '.85rem' }}>{currentStyle.icon}</span>
        <span style={{ color: '#ff9f0a' }}>{currentStyle.label}</span>
        <span style={{ color: 'rgba(255,255,255,.35)', fontSize: '.65rem', marginLeft: '2px' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'rgba(6,11,24,.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,159,10,.2)', borderRadius: '12px',
          padding: '.45rem',
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.3rem',
          minWidth: '130px',
          boxShadow: '0 8px 32px rgba(0,0,0,.7)',
        }}>
          {MAP_STYLES.map(style => (
            <button
              key={style.id}
              onClick={() => { onChange(style.id); setOpen(false); }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.2rem',
                padding: '.45rem .3rem', borderRadius: '8px', cursor: 'pointer',
                border: current === style.id ? '1.5px solid rgba(255,159,10,.6)' : '1.5px solid rgba(255,255,255,.06)',
                background: current === style.id ? 'rgba(255,159,10,.12)' : 'rgba(255,255,255,.03)',
                color: current === style.id ? '#ff9f0a' : 'rgba(255,255,255,.55)',
                fontSize: '.62rem', fontWeight: 700, fontFamily: 'var(--mono)',
                transition: 'all .15s',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{style.icon}</span>
              <span>{style.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DIRECTION HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/** Compass bearing (0–360°) from [lat,lng] point A to point B */
function bearing(from, to) {
  if (!from || !to) return 0;
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const dLng  = toRad(to[1] - from[1]);
  const lat1  = toRad(from[0]);
  const lat2  = toRad(to[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Given the bus position and the road-snapped ahead polyline,
 * find the closest segment and return the bearing of that segment.
 * This makes the icon face the actual road direction.
 */
function getDirectionBearing(busLL, aheadLine) {
  if (!busLL || !aheadLine || aheadLine.length < 2) return 0;
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < aheadLine.length; i++) {
    const d = Math.hypot(aheadLine[i][0] - busLL[0], aheadLine[i][1] - busLL[1]);
    if (d < minDist) { minDist = d; closestIdx = i; }
  }
  const nextIdx = Math.min(closestIdx + 1, aheadLine.length - 1);
  if (nextIdx === closestIdx) return 0;
  return bearing(aheadLine[closestIdx], aheadLine[nextIdx]);
}

/* ═══════════════════════════════════════════════════════════════════
   BUS ICON — Compact top-view vehicle pill, Rapido / Google Maps style
   ─────────────────────────────────────────────────────────────────
   • Small 48×56 px footprint
   • Top-down bus silhouette drawn in SVG
   • Directional chevron at the front (top of pill)
   • Entire icon rotated to face direction of travel
   • Route number label counter-rotated to stay readable
   • Soft drop shadow — no glow animations
   ═══════════════════════════════════════════════════════════════════ */
const makeBusIcon = (busNumber, headingDeg = 0, urgency = 'green') => {
  const color = urgency === 'red'   ? '#ef4444'
              : urgency === 'amber' ? '#f59e0b'
              :                       '#10b981';

  const label = String(busNumber).length > 5
    ? String(busNumber).slice(0, 4) + '…'
    : String(busNumber);

  return L.divIcon({
    className: '',
    iconSize:   [30, 42],
    iconAnchor: [15, 21],
    html: `
      <div style="
        width:30px; height:42px;
        display:flex; flex-direction:column; align-items:center;
        transform:rotate(${headingDeg}deg);
        transform-origin:15px 21px;
        pointer-events:auto;
      ">
        <!-- Direction tip -->
        <svg width="8" height="6" viewBox="0 0 8 6" style="display:block;margin-bottom:-1px;flex-shrink:0;">
          <path d="M4 0 L8 6 H0 Z" fill="${color}"/>
        </svg>

        <!-- Bus body -->
        <svg width="30" height="28" viewBox="0 0 30 28" fill="none" style="display:block;flex-shrink:0;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.4));">
          <!-- Body -->
          <rect x="7" y="0" width="16" height="24" rx="4" fill="${color}"/>
          <!-- Windshield -->
          <rect x="9" y="2" width="12" height="5" rx="1.5" fill="white" opacity="0.8"/>
          <!-- Two side windows -->
          <rect x="9"  y="10" width="5" height="4" rx="1" fill="white" opacity="0.6"/>
          <rect x="16" y="10" width="5" height="4" rx="1" fill="white" opacity="0.6"/>
          <!-- Front wheels -->
          <rect x="3"  y="2"  width="4" height="5" rx="2" fill="#111"/>
          <rect x="23" y="2"  width="4" height="5" rx="2" fill="#111"/>
          <!-- Rear wheels -->
          <rect x="3"  y="13" width="4" height="5" rx="2" fill="#111"/>
          <rect x="23" y="13" width="4" height="5" rx="2" fill="#111"/>
        </svg>

        <!-- Route label — counter-rotated to stay upright -->
        <div style="
          transform:rotate(${-headingDeg}deg);
          transform-origin:center top;
          margin-top:2px;
          background:${color};
          color:white;
          font-size:7px;
          font-weight:800;
          font-family:ui-monospace,monospace;
          padding:1px 4px;
          border-radius:3px;
          white-space:nowrap;
          line-height:1.5;
          pointer-events:none;
        ">${label}</div>
      </div>
    `,
  });
};
/* ─── Stop icon ────────────────────────────────────────────────── */
const makeMyStopIcon = () => L.divIcon({
  className: '',
  iconSize:  [48, 62],
  iconAnchor:[24, 62],
  html: `
    <style>
      .myst-wrap{position:relative;width:48px;height:62px;display:flex;flex-direction:column;align-items:center;}
      .myst-r1,.myst-r2,.myst-r3{position:absolute;border-radius:50%;border:1.5px solid rgba(255,159,10,.6);animation:mystRing 3s ease-out infinite;}
      .myst-r1{width:40px;height:40px;top:2px;left:50%;transform:translateX(-50%);}
      .myst-r2{width:40px;height:40px;top:2px;left:50%;transform:translateX(-50%);animation-delay:1s;}
      .myst-r3{width:40px;height:40px;top:2px;left:50%;transform:translateX(-50%);animation-delay:2s;}
      @keyframes mystRing{0%{transform:translateX(-50%) scale(.4);opacity:.9;}100%{transform:translateX(-50%) scale(2.4);opacity:0;}}
      .myst-diamond{width:28px;height:28px;background:linear-gradient(135deg,#ff9f0a,#ff5500);border:3px solid rgba(255,255,255,.9);border-radius:4px 50% 4px 50%;transform:rotate(45deg);position:relative;z-index:4;box-shadow:0 6px 20px rgba(255,159,10,.65);margin-top:6px;}
      .myst-diamond::after{content:'';position:absolute;top:4px;left:4px;width:8px;height:8px;background:rgba(255,255,255,.4);border-radius:50%;}
      .myst-stem{width:3px;height:20px;background:linear-gradient(to bottom,#ff9f0a,transparent);margin-top:-2px;border-radius:1px;position:relative;z-index:3;}
      .myst-dot{width:5px;height:5px;border-radius:50%;background:#ff9f0a;box-shadow:0 0 6px rgba(255,159,10,.8);position:relative;z-index:3;}
    </style>
    <div class="myst-wrap">
      <div class="myst-r1"></div><div class="myst-r2"></div><div class="myst-r3"></div>
      <div class="myst-diamond"></div>
      <div class="myst-stem"></div>
      <div class="myst-dot"></div>
    </div>
  `
});

/* ─── Passenger icon ─────────────────────────────────────────────── */
const makePassengerIcon = () => L.divIcon({
  className: '',
  iconSize:  [56, 60],
  iconAnchor:[28, 54],
  html: `
    <style>
      .pax-wrap{position:relative;width:56px;height:60px;display:flex;flex-direction:column;align-items:center;}
      .pax-s1,.pax-s2{position:absolute;width:44px;height:44px;border-radius:50%;border:2px solid rgba(0,229,255,.5);top:0;left:50%;animation:paxSonar 2.2s ease-out infinite;}
      .pax-s2{animation-delay:1.1s;}
      @keyframes paxSonar{0%{transform:translateX(-50%) scale(.4);opacity:.9;}100%{transform:translateX(-50%) scale(2.2);opacity:0;}}
      .pax-core{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#4df0ff,#00b8cc);border:3px solid rgba(255,255,255,.9);box-shadow:0 0 0 4px rgba(0,229,255,.2),0 4px 16px rgba(0,229,255,.5);position:relative;z-index:4;margin-top:9px;}
      .pax-you{margin-top:3px;background:#00e5ff;color:#001a1f;font-family:'Space Mono',monospace;font-size:.55rem;font-weight:700;padding:.1rem .35rem;border-radius:4px;letter-spacing:.06em;white-space:nowrap;}
    </style>
    <div class="pax-wrap">
      <div class="pax-s1"></div><div class="pax-s2"></div>
      <div class="pax-core"></div>
      <div class="pax-you">YOU</div>
    </div>
  `
});

/* ─── Stop dots ──────────────────────────────────────────────────── */
const dotUpcoming = L.divIcon({
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#1a3a6e;border:2.5px solid rgba(255,159,10,.6);box-shadow:0 0 6px rgba(255,159,10,.25);"></div>`
});

const dotPassed = L.divIcon({
  className: '',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
  html: `<div style="width:8px;height:8px;border-radius:50%;background:#1a2a40;border:1.5px solid rgba(255,255,255,.15);"></div>`
});

/* ─── AutoFit ────────────────────────────────────────────────────── */
function AutoFit({ points }) {
  const map    = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!points?.length || fitted.current) return;
    try { map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 15 }); fitted.current = true; }
    catch (_) {}
  }, [points, map]);
  return null;
}

/* ─── Haversine ──────────────────────────────────────────────────── */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, r = d => d * Math.PI / 180;
  const a = Math.sin(r(lat2-lat1)/2)**2 + Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(r(lng2-lng1)/2)**2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2);
}

/* ═══════════════════════════════════════════════════════════════════
   OSRM road-snapping
   ═══════════════════════════════════════════════════════════════════ */
async function snapToRoads(waypoints) {
  if (!waypoints || waypoints.length < 2) return waypoints.map(p => [p.lat, p.lng]);
  const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.[0]) throw new Error('OSRM bad response');
    return json.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch (err) {
    console.warn('[OSRM] road-snap failed, falling back:', err.message);
    return waypoints.map(p => [p.lat, p.lng]);
  }
}

async function buildSnappedSegments(poly) {
  const passedPts = poly.filter(p => p.isPassed || p.isScannedStop);
  const aheadPts  = poly.filter(p => !p.isPassed || p.isScannedStop);
  const [snappedPassed, snappedAhead] = await Promise.all([
    passedPts.length >= 2 ? snapToRoads(passedPts) : Promise.resolve(passedPts.map(p => [p.lat, p.lng])),
    aheadPts.length  >= 2 ? snapToRoads(aheadPts)  : Promise.resolve(aheadPts.map(p => [p.lat, p.lng])),
  ]);
  return { snappedPassed, snappedAhead };
}

/* ═══════════════════════════════════════════════════════════════════ */

const REFRESH = 10;
const LOC = { IDLE:'idle', ASKING:'asking', GRANTED:'granted', DENIED:'denied', UNSUPPORTED:'unsupported' };

export default function StopPage() {
  const { stopId } = useParams();
  const [data,           setData]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [countdown,      setCountdown]      = useState(REFRESH);
  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [lastRefresh,    setLastRefresh]    = useState(null);
  const [activeBus,      setActiveBus]      = useState(0);
  const [locState,       setLocState]       = useState(LOC.IDLE);
  const [myPos,          setMyPos]          = useState(null);
  const [mapStyleId,     setMapStyleId]     = useState('dark');
  const [snappedRoutes,  setSnappedRoutes]  = useState({});
  const snappingRef = useRef({});
  const watchRef    = useRef(null);
  const timerRef    = useRef(null);
  const countRef    = useRef(null);

  /* ── Fetch ── */
  const fetchData = useCallback(async (spinner = false, coords = null) => {
    if (spinner) setIsRefreshing(true);
    const pos = coords ?? myPos;
    try {
      const { data: res } = await getBusesForStop(stopId, pos?.lat, pos?.lng);
      setData(res);
      setLastRefresh(new Date());
      setCountdown(REFRESH);
      setError('');
      setSnappedRoutes({});
      snappingRef.current = {};
    } catch { setError('Could not reach server.'); }
    finally  { setLoading(false); setIsRefreshing(false); }
  }, [stopId, myPos]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(() => fetchData(), REFRESH * 1000);
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH : c - 1), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current); };
  }, [fetchData]);

  useEffect(() => { if (myPos) fetchData(false, myPos); }, [myPos]); // eslint-disable-line

  /* ── Road-snap ── */
  useEffect(() => {
    if (!data?.buses?.length) return;
    const bus  = data.buses[activeBus] ?? data.buses[0];
    const poly = bus?.routePolyline ?? [];
    if (poly.length < 2) return;
    if (snappedRoutes[activeBus] || snappingRef.current[activeBus]) return;
    snappingRef.current[activeBus] = true;
    buildSnappedSegments(poly).then(result => {
      setSnappedRoutes(prev => ({ ...prev, [activeBus]: result }));
    });
  }, [data, activeBus]); // eslint-disable-line

  /* ── Geolocation ── */
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocState(LOC.UNSUPPORTED); return; }
    setLocState(LOC.ASKING);
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocState(LOC.GRANTED);
      },
      err => setLocState(err.code === 1 ? LOC.DENIED : LOC.UNSUPPORTED),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setMyPos(null); setLocState(LOC.IDLE);
  }, []);

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  /* ── Helpers ── */
  const urgency = m => m <= 2 ? 'red' : m <= 5 ? 'amber' : 'green';
  const fmtMin  = m => m === 0 ? 'Now!' : m === 1 ? '1 min' : `${m} min`;
  const fmtLong = m => m === 0 ? 'Arriving now' : `${m} min${m !== 1 ? 's' : ''} away`;
  const etaPct  = m => Math.max(5, Math.min(100, 100 - (m / 30) * 100));

  const activeStyle = MAP_STYLES.find(s => s.id === mapStyleId) || MAP_STYLES[0];

  if (loading) return (
    <div className="sp-screen">
      <div className="sp-loader-bus">
        <div className="sp-loader-road"><div className="sp-loader-road-line" /></div>
        <div className="sp-loader-vehicle">🚌</div>
      </div>
      <p className="sp-loader-txt">Tracking buses near you…</p>
      <div className="sp-loader-dots"><span/><span/><span/></div>
    </div>
  );

  if (error && !data) return (
    <div className="sp-screen">
      <span className="sp-icon-xl">📡</span>
      <h2>Signal lost</h2>
      <p className="sp-muted">{error}</p>
      <button className="btn btn-primary btn-sm" onClick={() => fetchData(true)}>Retry</button>
    </div>
  );

  const { stop, buses, passenger: psgr } = data || {};
  const bus      = buses?.[activeBus] ?? buses?.[0];
  const poly     = bus?.routePolyline ?? [];
  const myLL     = myPos ? [myPos.lat, myPos.lng] : null;
  const busLL    = bus?.currentLocation?.coordinates?.length === 2
    ? [bus.currentLocation.coordinates[1], bus.currentLocation.coordinates[0]] : null;
  const myStopPt = poly.find(p => p.isScannedStop);
  const stopLL   = myStopPt ? [myStopPt.lat, myStopPt.lng] : null;

  const snapped   = snappedRoutes[activeBus];
  const passedLL  = snapped?.snappedPassed ?? poly.filter(p =>  p.isPassed).map(p => [p.lat, p.lng]);
  const aheadLL   = snapped?.snappedAhead  ?? poly.filter(p => !p.isPassed).map(p => [p.lat, p.lng]);

  /* ── Bus heading: face the direction of the next road segment ── */
  const busHeading = getDirectionBearing(busLL, aheadLL.length >= 2 ? aheadLL : null);

  const fitPoints     = [...poly.map(p => [p.lat, p.lng]), ...(busLL ? [busLL] : []), ...(myLL ? [myLL] : [])];
  const mapCenter     = myLL ?? stopLL ?? fitPoints[0] ?? [13.0827, 80.2707];
  const walkLine      = myLL && stopLL ? [myLL, stopLL] : null;
  const liveDistToBus = myPos && busLL ? haversine(myPos.lat, myPos.lng, busLL[0], busLL[1]) : null;
  const u             = bus ? urgency(bus.etaMinutes) : 'green';

  return (
    <div className="sp-page">

      {/* ═══ HEADER ════════════════════════════════════════════ */}
      <header className="sp-header">
        <div className="sp-hdr-left">
          <div className="sp-stop-badge"><span className="sp-stop-badge-icon">🚏</span></div>
          <div>
            <h1 className="sp-stop-name">{stop?.name}</h1>
            <div className="sp-stop-meta">
              <span className="sp-code-chip">{stop?.stopCode}</span>
              {stop?.address && <span className="sp-addr">{stop.address}</span>}
            </div>
          </div>
        </div>
        <div className="sp-hdr-right">
          <div className="sp-countdown">
            <svg className="sp-cdown-ring" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.5"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--amber)" strokeWidth="2.5"
                strokeDasharray="94.2"
                strokeDashoffset={94.2 - (countdown / REFRESH) * 94.2}
                strokeLinecap="round" transform="rotate(-90 18 18)"
                style={{transition:'stroke-dashoffset 1s linear'}}/>
            </svg>
            <span className="sp-cdown-num">{countdown}</span>
          </div>
        </div>
      </header>

      {/* ═══ LOCATION BANNER ════════════════════════════════════ */}
      {locState === LOC.IDLE && (
        <div className="sp-loc-prompt">
          <div className="sp-loc-prompt-glow" />
          <div className="sp-loc-prompt-icon">📍</div>
          <div className="sp-loc-prompt-text">
            <div className="sp-loc-title">Personalised ETAs</div>
            <div className="sp-loc-sub">See exact walking time + total door-to-bus journey duration</div>
          </div>
          <button className="btn btn-neon btn-sm" onClick={requestLocation}>Enable</button>
        </div>
      )}
      {locState === LOC.ASKING && (
        <div className="sp-loc-status asking"><div className="spinner"/><span>Requesting location…</span></div>
      )}
      {locState === LOC.DENIED && (
        <div className="sp-loc-status denied"><span>🚫</span><span>Location denied — enable in browser settings</span></div>
      )}
      {locState === LOC.GRANTED && myPos && (
        <div className="sp-loc-active">
          <span className="sp-loc-active-dot" />
          <span className="sp-loc-active-txt">
            📍 Location active
            {psgr && <> · 🚶 {psgr.walkingDistanceKm} km ({psgr.walkingMinutes} min walk)</>}
            {myPos.accuracy && <> · ±{Math.round(myPos.accuracy)}m</>}
          </span>
          <button className="sp-loc-stop" onClick={stopTracking}>✕</button>
        </div>
      )}

      {/* ═══ NO BUSES ═══════════════════════════════════════════ */}
      {!buses?.length && (
        <div className="sp-empty">
          <div className="sp-empty-icon">🔍</div>
          <h2>No buses approaching</h2>
          <p>Nothing heading to <strong>{stop?.name}</strong> right now.</p>
          <p className="sp-muted">Auto-refreshes every {REFRESH}s</p>
        </div>
      )}

      {/* ═══ MAP ════════════════════════════════════════════════ */}
      {buses?.length > 0 && (
        <div className="sp-map-card">
          <div className="sp-map-bar">
            <span className="sp-map-ttl">
              <span className="sp-map-dot" />
              Live Map
              {!snapped && poly.length >= 2 && (
                <span style={{ fontSize:'.65rem', color:'rgba(255,159,10,.6)', marginLeft:'6px' }}>
                  ⟳ snapping route…
                </span>
              )}
            </span>
            {bus && <span className="sp-map-chip">🚌 {bus.busNumber} · Rte {bus.routeNumber}</span>}
          </div>

          <div className="sp-mapbox">
            {fitPoints.length > 0 ? (
              <MapContainer center={mapCenter} zoom={14}
                style={{ width:'100%', height:'100%' }}
                scrollWheelZoom={false} zoomControl={true}>

                <TileLayerSwitcher style={activeStyle} />
                <style>{`
                  .leaflet-tile-pane { filter: ${activeStyle.filter}; transition: filter .4s ease; }
                `}</style>

                {fitPoints.length > 1 && <AutoFit points={fitPoints} />}

                {/* Passed route */}
                {passedLL.length > 1 && (
                  <Polyline positions={passedLL}
                    pathOptions={{ color:'rgba(255,255,255,.15)', weight:4, dashArray:'6 8', lineCap:'round' }} />
                )}

                {/* Ahead route — outline + fill for a road-like look */}
                {aheadLL.length > 1 && (
                  <>
                    <Polyline positions={aheadLL}
                      pathOptions={{ color:'rgba(0,0,0,0.2)', weight:8, lineCap:'round', lineJoin:'round' }} />
                    <Polyline positions={aheadLL}
                      pathOptions={{ color:'#ff9f0a', weight:5.5, opacity:1, lineCap:'round', lineJoin:'round' }} />
                  </>
                )}

                {/* Walk line */}
                {walkLine && (
                  <Polyline positions={walkLine}
                    pathOptions={{ color:'#00e5ff', weight:2.5, dashArray:'8 6', opacity:.8 }} />
                )}

                {/* Stop markers */}
                {poly.map((pt, i) =>
                  pt.isScannedStop ? (
                    <React.Fragment key={i}>
                      <Circle center={[pt.lat, pt.lng]} radius={90}
                        pathOptions={{ color:'#ff9f0a', fillColor:'rgba(255,159,10,.12)', fillOpacity:1, weight:2 }} />
                      <Marker position={[pt.lat, pt.lng]} icon={makeMyStopIcon()}>
                        <Popup offset={[0, -22]}>
                          <strong>🚏 {pt.name}</strong> — Your stop
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  ) : (
                    <Marker key={i} position={[pt.lat, pt.lng]} icon={pt.isPassed ? dotPassed : dotUpcoming}>
                      <Popup><strong>{pt.name}</strong>{pt.isPassed ? ' · ✓ Passed' : ' · ↑ Upcoming'}</Popup>
                    </Marker>
                  )
                )}

                {/* ── Bus — compact directional vehicle icon ── */}
                {busLL && (
                  <Marker
                    position={busLL}
                    icon={makeBusIcon(bus.busNumber, busHeading, u)}
                    zIndexOffset={1000}
                  >
                    <Popup offset={[0, -30]}>
                      <div style={{ minWidth:'120px' }}>
                        <strong>🚌 {bus.busNumber}</strong><br/>
                        <span>{bus.speed || 0} km/h · {fmtLong(bus.etaMinutes)}</span>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Passenger */}
                {myLL && (
                  <>
                    {myPos.accuracy && (
                      <Circle center={myLL} radius={Math.min(myPos.accuracy, 180)}
                        pathOptions={{ color:'#00e5ff', fillColor:'rgba(0,229,255,.08)', fillOpacity:1, weight:1.5, dashArray:'4 4' }} />
                    )}
                    <Marker position={myLL} icon={makePassengerIcon()}>
                      <Popup offset={[0, -44]}>
                        <strong>📍 You</strong>
                        {liveDistToBus !== null && <><br/>{liveDistToBus} km from bus</>}
                      </Popup>
                    </Marker>
                  </>
                )}

                <MapStyleSwitcher current={mapStyleId} onChange={setMapStyleId} />
              </MapContainer>
            ) : (
              <div className="sp-map-empty"><span>🗺</span><p>Map unavailable</p></div>
            )}

            {/* Legend */}
            <div className="sp-legend">
              <span className="sp-leg"><span className="sp-leg-line amber"/>Route</span>
              <span className="sp-leg"><span className="sp-leg-dot green"/>Bus</span>
              <span className="sp-leg"><span className="sp-leg-dot amber"/>Stop</span>
              {myLL && <>
                <span className="sp-leg"><span className="sp-leg-dot neon"/>You</span>
                <span className="sp-leg"><span className="sp-leg-line neon dashed"/>Walk</span>
              </>}
            </div>
          </div>

          {/* Breadcrumb */}
          {poly.length > 0 && (
            <div className="sp-strip">
              {poly.map((pt, i) => (
                <React.Fragment key={i}>
                  <span className={`sp-chip ${pt.isScannedStop ? 'scanned' : pt.isPassed ? 'done' : ''}`}>
                    {pt.isScannedStop ? '📍 ' : ''}{pt.name}
                  </span>
                  {i < poly.length - 1 && <span className="sp-chip-arr">›</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ BUS TABS ═══════════════════════════════════════════ */}
      {buses?.length > 1 && (
        <div className="sp-tabs">
          {buses.map((b, i) => {
            const ub = urgency(b.etaMinutes);
            return (
              <button key={b._id}
                className={`sp-tab ${activeBus === i ? 'active' : ''} ut-${ub}`}
                onClick={() => setActiveBus(i)}>
                {i === 0 && <span className="sp-tab-next">NEXT</span>}
                <span className="sp-tab-num">{b.busNumber}</span>
                <span className="sp-tab-eta">{fmtMin(b.etaMinutes)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ HERO CARD ══════════════════════════════════════════ */}
      {bus && (
        <div className={`sp-hero uh-${u}`}>
          <div className={`sp-hero-glow ug-${u}`} />
          <div className="sp-hero-top">
            <div className="sp-hero-left">
              <div className="sp-hero-label">{activeBus === 0 ? 'Next Bus' : `Bus ${activeBus + 1}`}</div>
              <div className={`sp-hero-num un-${u}`}>{bus.busNumber}</div>
              {bus.busName && <div className="sp-hero-sub">{bus.busName}</div>}
              <div className="sp-hero-route">Route {bus.routeNumber} — {bus.routeName}</div>
            </div>
            <div className={`sp-eta-orb uo-${u}`}>
              <div className={`sp-eta-orb-ring uor-${u}`} />
              <span className="sp-eta-num">{fmtMin(bus.etaMinutes)}</span>
              <span className="sp-eta-sub">{bus.etaMinutes === 0 ? 'arriving' : myPos ? 'bus ETA' : 'away'}</span>
            </div>
          </div>

          {myPos && psgr && (
            <div className="sp-journey">
              <div className="sp-jstep">
                <div className="sp-jstep-icon">🚌</div>
                <div className="sp-jstep-val">{fmtMin(bus.etaMinutes)}</div>
                <div className="sp-jstep-lbl">bus to stop</div>
              </div>
              <div className="sp-jplus">+</div>
              <div className="sp-jstep">
                <div className="sp-jstep-icon">🚶</div>
                <div className="sp-jstep-val">{psgr.walkingMinutes} min</div>
                <div className="sp-jstep-lbl">walk to stop</div>
              </div>
              <div className="sp-jplus">=</div>
              <div className={`sp-jtotal uo-${urgency(bus.totalJourneyMinutes)}`}>
                <div className="sp-jstep-val">{fmtMin(bus.totalJourneyMinutes)}</div>
                <div className="sp-jstep-lbl">total journey</div>
              </div>
            </div>
          )}

          <div className="sp-prog">
            <div className="sp-prog-track">
              <div className={`sp-prog-fill upf-${u}`} style={{ width:`${etaPct(bus.etaMinutes)}%` }} />
              <div className={`sp-prog-dot upd-${u}`} style={{ left:`${etaPct(bus.etaMinutes)}%` }} />
            </div>
            <div className="sp-prog-labels">
              <span className={`upt-${u}`}>{fmtLong(bus.etaMinutes)}</span>
              <span className="sp-muted">30 min</span>
            </div>
          </div>

          <div className="sp-stats">
            {myPos ? (
              <>
                <div className="sp-stat"><div className="sp-stat-i">📍</div><div className="sp-stat-v">{liveDistToBus ?? bus.distanceKm} km</div><div className="sp-stat-l">to bus</div></div>
                <div className="sp-stat-sep"/>
                <div className="sp-stat"><div className="sp-stat-i">🚶</div><div className="sp-stat-v">{psgr?.walkingDistanceKm ?? '—'}</div><div className="sp-stat-l">km walk</div></div>
                <div className="sp-stat-sep"/>
                <div className="sp-stat"><div className="sp-stat-i">🚦</div><div className="sp-stat-v">{bus.stopsAway}</div><div className="sp-stat-l">stop{bus.stopsAway !== 1 ? 's' : ''}</div></div>
                <div className="sp-stat-sep"/>
                <div className="sp-stat"><div className="sp-stat-i">⚡</div><div className="sp-stat-v">{bus.speed || 0}</div><div className="sp-stat-l">km/h</div></div>
              </>
            ) : (
              <>
                <div className="sp-stat"><div className="sp-stat-i">📍</div><div className="sp-stat-v">{bus.distanceKm} km</div><div className="sp-stat-l">away</div></div>
                <div className="sp-stat-sep"/>
                <div className="sp-stat"><div className="sp-stat-i">🚦</div><div className="sp-stat-v">{bus.stopsAway}</div><div className="sp-stat-l">stop{bus.stopsAway !== 1 ? 's' : ''}</div></div>
                <div className="sp-stat-sep"/>
                <div className="sp-stat"><div className="sp-stat-i">⚡</div><div className="sp-stat-v">{bus.speed || 0}</div><div className="sp-stat-l">km/h</div></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═════════════════════════════════════════════ */}
      <footer className="sp-footer">
        {lastRefresh && <span className="sp-muted">Updated {lastRefresh.toLocaleTimeString()}</span>}
        <button className="btn btn-outline btn-sm" onClick={() => fetchData(true)} disabled={isRefreshing}>
          {isRefreshing ? <><div className="spinner"/> Refreshing…</> : '↻ Refresh'}
        </button>
        <Link to="/" className="sp-back">← All stops</Link>
      </footer>
    </div>
  );
}
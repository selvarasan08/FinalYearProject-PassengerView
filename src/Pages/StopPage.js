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
   CUSTOM MAP ICONS — pure CSS/SVG, no external images
   ═══════════════════════════════════════════════════════════════════ */

// 🚌 MAIN BUS — Floating 3D-style capsule with exhaust trail + number plate
const makeBusIcon = (busNumber, speed, urgency) => {
  const color = urgency === 'red' ? '#ff4d6a' : urgency === 'amber' ? '#ffd60a' : '#00d68f';
  const shadow = urgency === 'red' ? 'rgba(255,77,106,0.5)' : urgency === 'amber' ? 'rgba(255,214,10,0.4)' : 'rgba(0,214,143,0.4)';
  return L.divIcon({
    className: '',
    iconSize:  [72, 64],
    iconAnchor:[36, 58],
    html: `
      <style>
        .bic${busNumber}{position:relative;width:72px;height:64px;display:flex;flex-direction:column;align-items:center;}
        /* Exhaust particles */
        .bic${busNumber} .exhaust{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:4px;z-index:1;}
        .bic${busNumber} .ex{width:4px;height:4px;border-radius:50%;background:rgba(${urgency==='red'?'255,77,106':'0,214,143'},.6);
          animation:exFloat 1.2s ease-out infinite;}
        .bic${busNumber} .ex:nth-child(2){animation-delay:.3s;width:3px;height:3px;}
        .bic${busNumber} .ex:nth-child(3){animation-delay:.6s;width:2px;height:2px;}
        @keyframes exFloat{0%{transform:translateY(0) scale(1);opacity:.7;}100%{transform:translateY(-16px) scale(0);opacity:0;}}
        /* Main body */
        .bic${busNumber} .body{
          width:62px;height:42px;
          background:linear-gradient(160deg,#0f2040,#081528);
          border:2px solid ${color};
          border-radius:12px 12px 8px 8px;
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
          position:relative;z-index:3;
          box-shadow:0 0 0 1px rgba(255,255,255,0.06), 0 6px 24px rgba(0,0,0,.7), 0 0 20px ${shadow};
          animation:busFloat 2s ease-in-out infinite alternate;
          overflow:hidden;
        }
        @keyframes busFloat{from{transform:translateY(0);}to{transform:translateY(-4px);}}
        /* Shine streak */
        .bic${busNumber} .body::after{
          content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);
          animation:busShine 3.5s ease-in-out infinite;
        }
        @keyframes busShine{0%,100%{left:-100%;}50%{left:120%;}}
        /* Windows row */
        .bic${busNumber} .windows{display:flex;gap:3px;}
        .bic${busNumber} .win{width:8px;height:6px;border-radius:2px;background:rgba(0,229,255,.3);border:1px solid rgba(0,229,255,.4);}
        .bic${busNumber} .win.lit{background:rgba(255,214,10,.4);border-color:rgba(255,214,10,.5);animation:winBlink 2.4s ease infinite;}
        @keyframes winBlink{0%,100%{opacity:1;}50%{opacity:.5;}}
        /* Number plate */
        .bic${busNumber} .plate{
          font-family:'Space Mono',monospace;font-size:.6rem;font-weight:700;
          color:${color};letter-spacing:.05em;
          text-shadow:0 0 8px ${shadow};
        }
        /* Shadow on ground */
        .bic${busNumber} .gnd{
          width:44px;height:7px;
          background:radial-gradient(${shadow},transparent 70%);
          border-radius:50%;margin-top:-4px;
          animation:gndPulse 2s ease-in-out infinite alternate;
          position:relative;z-index:2;
        }
        @keyframes gndPulse{from{transform:scaleX(.8);opacity:.6;}to{transform:scaleX(1.1);opacity:1;}}
        /* Speed ring */
        .bic${busNumber} .sring{
          position:absolute;top:-6px;left:50%;transform:translateX(-50%);
          width:70px;height:70px;border-radius:50%;z-index:0;
          border:1.5px solid ${color};opacity:.35;
          animation:sringPulse 2s ease-out infinite;
        }
        @keyframes sringPulse{0%{transform:translateX(-50%) scale(.5);opacity:.6;}100%{transform:translateX(-50%) scale(1.4);opacity:0;}}
      </style>
      <div class="bic${busNumber}">
        <div class="sring"></div>
        <div class="exhaust"><div class="ex"></div><div class="ex"></div><div class="ex"></div></div>
        <div class="body">
          <div class="windows">
            <div class="win lit"></div><div class="win"></div><div class="win lit"></div>
            <div class="win"></div><div class="win lit"></div>
          </div>
          <div class="plate">${busNumber}</div>
        </div>
        <div class="gnd"></div>
      </div>
    `
  });
};

// 🚏 SCANNED STOP — Diamond tower with sonar rings
const makeMyStopIcon = () => L.divIcon({
  className: '',
  iconSize:  [48, 62],
  iconAnchor:[24, 62],
  html: `
    <style>
      .myst-wrap{position:relative;width:48px;height:62px;display:flex;flex-direction:column;align-items:center;}
      .myst-r1,.myst-r2,.myst-r3{
        position:absolute;border-radius:50%;
        border:1.5px solid rgba(255,159,10,.6);
        animation:mystRing 3s ease-out infinite;
      }
      .myst-r1{width:40px;height:40px;top:2px;left:50%;transform:translateX(-50%);}
      .myst-r2{width:40px;height:40px;top:2px;left:50%;transform:translateX(-50%);animation-delay:1s;}
      .myst-r3{width:40px;height:40px;top:2px;left:50%;transform:translateX(-50%);animation-delay:2s;}
      @keyframes mystRing{0%{transform:translateX(-50%) scale(.4);opacity:.9;}100%{transform:translateX(-50%) scale(2.4);opacity:0;}}
      .myst-diamond{
        width:28px;height:28px;
        background:linear-gradient(135deg,#ff9f0a,#ff5500);
        border:3px solid rgba(255,255,255,.9);
        border-radius:4px 50% 4px 50%;
        transform:rotate(45deg);
        position:relative;z-index:4;
        box-shadow:0 6px 20px rgba(255,159,10,.65), 0 2px 8px rgba(0,0,0,.5);
        margin-top:6px;
        animation:diamondPop .3s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes diamondPop{from{transform:rotate(45deg) scale(0);}to{transform:rotate(45deg) scale(1);}}
      /* Inner shine */
      .myst-diamond::after{
        content:'';position:absolute;
        top:4px;left:4px;
        width:8px;height:8px;
        background:rgba(255,255,255,.4);
        border-radius:50%;
      }
      .myst-stem{width:3px;height:20px;background:linear-gradient(to bottom,#ff9f0a,transparent);margin-top:-2px;border-radius:1px;position:relative;z-index:3;}
      .myst-dot{width:5px;height:5px;border-radius:50%;background:#ff9f0a;box-shadow:0 0 6px rgba(255,159,10,.8);position:relative;z-index:3;}
    </style>
    <div class="myst-wrap">
      <div class="myst-r1"></div>
      <div class="myst-r2"></div>
      <div class="myst-r3"></div>
      <div class="myst-diamond"></div>
      <div class="myst-stem"></div>
      <div class="myst-dot"></div>
    </div>
  `
});

// 📍 PASSENGER — Teal sonar beacon with "YOU" label
const makePassengerIcon = () => L.divIcon({
  className: '',
  iconSize:  [56, 60],
  iconAnchor:[28, 54],
  html: `
    <style>
      .pax-wrap{position:relative;width:56px;height:60px;display:flex;flex-direction:column;align-items:center;}
      .pax-s1,.pax-s2{
        position:absolute;width:44px;height:44px;
        border-radius:50%;border:2px solid rgba(0,229,255,.5);
        top:0;left:50%;
        animation:paxSonar 2.2s ease-out infinite;
      }
      .pax-s2{animation-delay:1.1s;}
      @keyframes paxSonar{0%{transform:translateX(-50%) scale(.4);opacity:.9;}100%{transform:translateX(-50%) scale(2.2);opacity:0;}}
      .pax-core{
        width:26px;height:26px;border-radius:50%;
        background:radial-gradient(circle at 35% 35%,#4df0ff,#00b8cc);
        border:3px solid rgba(255,255,255,.9);
        box-shadow:0 0 0 4px rgba(0,229,255,.2), 0 4px 16px rgba(0,229,255,.5);
        position:relative;z-index:4;margin-top:9px;
        animation:paxBreath 2s ease-in-out infinite alternate;
      }
      @keyframes paxBreath{from{box-shadow:0 0 0 4px rgba(0,229,255,.2),0 4px 16px rgba(0,229,255,.4);}to{box-shadow:0 0 0 8px rgba(0,229,255,.1),0 4px 24px rgba(0,229,255,.6);}}
      .pax-you{
        margin-top:3px;
        background:#00e5ff;color:#001a1f;
        font-family:'Space Mono',monospace;font-size:.55rem;font-weight:700;
        padding:.1rem .35rem;border-radius:4px;
        letter-spacing:.06em;
        box-shadow:0 2px 8px rgba(0,229,255,.4);
        position:relative;z-index:4;
        white-space:nowrap;
      }
    </style>
    <div class="pax-wrap">
      <div class="pax-s1"></div>
      <div class="pax-s2"></div>
      <div class="pax-core"></div>
      <div class="pax-you">YOU</div>
    </div>
  `
});

// Regular stop dot (upcoming)
const dotUpcoming = L.divIcon({
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#1a3a6e;border:2.5px solid rgba(255,159,10,.6);box-shadow:0 0 6px rgba(255,159,10,.25);"></div>`
});

// Regular stop dot (passed)
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

const REFRESH = 10;
const LOC = { IDLE:'idle', ASKING:'asking', GRANTED:'granted', DENIED:'denied', UNSUPPORTED:'unsupported' };

/* ═══════════════════════════════════════════════════════════════════
   STOP PAGE COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function StopPage() {
  const { stopId } = useParams();
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [countdown,    setCountdown]    = useState(REFRESH);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const [activeBus,    setActiveBus]    = useState(0);
  const [locState,     setLocState]     = useState(LOC.IDLE);
  const [myPos,        setMyPos]        = useState(null);
  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const countRef = useRef(null);

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

  /* ── Loading ── */
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
  const bus     = buses?.[activeBus] ?? buses?.[0];
  const poly    = bus?.routePolyline ?? [];
  const myLL    = myPos ? [myPos.lat, myPos.lng] : null;
  const busLL   = bus?.currentLocation?.coordinates?.length === 2
    ? [bus.currentLocation.coordinates[1], bus.currentLocation.coordinates[0]] : null;
  const myStopPt = poly.find(p => p.isScannedStop);
  const stopLL   = myStopPt ? [myStopPt.lat, myStopPt.lng] : null;
  const passedLL = poly.filter(p =>  p.isPassed).map(p => [p.lat, p.lng]);
  const aheadLL  = poly.filter(p => !p.isPassed).map(p => [p.lat, p.lng]);
  const fitPoints = [...poly.map(p => [p.lat, p.lng]), ...(busLL ? [busLL] : []), ...(myLL ? [myLL] : [])];
  const mapCenter = myLL ?? stopLL ?? fitPoints[0] ?? [13.0827, 80.2707];
  const walkLine  = myLL && stopLL ? [myLL, stopLL] : null;
  const liveDistToBus = myPos && busLL ? haversine(myPos.lat, myPos.lng, busLL[0], busLL[1]) : null;
  const u = bus ? urgency(bus.etaMinutes) : 'green';

  return (
    <div className="sp-page">

      {/* ═══ HEADER ════════════════════════════════════════════ */}
      <header className="sp-header">
        <div className="sp-hdr-left">
          <div className="sp-stop-badge">
            <span className="sp-stop-badge-icon">🚏</span>
          </div>
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
                strokeLinecap="round" transform="rotate(-90 18 18)" style={{transition:'stroke-dashoffset 1s linear'}}/>
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
        <div className="sp-loc-status asking">
          <div className="spinner" />
          <span>Requesting location…</span>
        </div>
      )}
      {locState === LOC.DENIED && (
        <div className="sp-loc-status denied">
          <span>🚫</span>
          <span>Location denied — enable in browser settings for personalised ETAs</span>
        </div>
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
            </span>
            {bus && <span className="sp-map-chip">🚌 {bus.busNumber} · Rte {bus.routeNumber}</span>}
          </div>

          <div className="sp-mapbox">
            {fitPoints.length > 0 ? (
              <MapContainer center={mapCenter} zoom={14}
                style={{ width:'100%', height:'100%' }}
                scrollWheelZoom={false} zoomControl={true}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© OpenStreetMap'
                />
                {fitPoints.length > 1 && <AutoFit points={fitPoints} />}

                {/* Passed route */}
                {passedLL.length > 1 && (
                  <Polyline positions={passedLL}
                    pathOptions={{ color:'rgba(255,255,255,.15)', weight:3, dashArray:'5 8' }} />
                )}
                {/* Active route */}
                {aheadLL.length > 1 && (
                  <Polyline positions={aheadLL}
                    pathOptions={{ color:'#ff9f0a', weight:4.5, opacity:.85 }} />
                )}
                {/* Walk line */}
                {walkLine && (
                  <Polyline positions={walkLine}
                    pathOptions={{ color:'#00e5ff', weight:2.5, dashArray:'8 6', opacity:.8 }} />
                )}

                {/* Stop dots */}
                {poly.map((pt, i) =>
                  pt.isScannedStop ? (
                    <React.Fragment key={i}>
                      <Circle center={[pt.lat, pt.lng]} radius={90}
                        pathOptions={{ color:'#ff9f0a', fillColor:'rgba(255,159,10,.15)', fillOpacity:1, weight:2 }} />
                      <Marker position={[pt.lat, pt.lng]} icon={makeMyStopIcon()}>
                        <Popup offset={[0, -22]}>
                          <strong>🚏 {pt.name}</strong>
                          Your scanned stop
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  ) : (
                    <Marker key={i} position={[pt.lat, pt.lng]} icon={pt.isPassed ? dotPassed : dotUpcoming}>
                      <Popup><strong>{pt.name}</strong>{pt.isPassed ? ' · ✓ Passed' : ' · ↑ Upcoming'}</Popup>
                    </Marker>
                  )
                )}

                {/* Bus */}
                {busLL && (
                  <Marker position={busLL} icon={makeBusIcon(bus.busNumber, bus.speed || 0, u)}>
                    <Popup offset={[0, -52]}>
                      <strong>🚌 {bus.busNumber}</strong>
                      {bus.speed || 0} km/h · {fmtLong(bus.etaMinutes)}
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
                        {liveDistToBus !== null && `${liveDistToBus} km from bus`}
                      </Popup>
                    </Marker>
                  </>
                )}
              </MapContainer>
            ) : (
              <div className="sp-map-empty"><span>🗺</span><p>Map unavailable</p></div>
            )}

            {/* Legend */}
            <div className="sp-legend">
              <span className="sp-leg"><span className="sp-leg-line amber"/>Route</span>
              <span className="sp-leg"><span className="sp-leg-dot green"/>Bus</span>
              <span className="sp-leg"><span className="sp-leg-dot amber"/>Stop</span>
              {myLL && <><span className="sp-leg"><span className="sp-leg-dot neon"/>You</span>
              <span className="sp-leg"><span className="sp-leg-line neon dashed"/>Walk</span></>}
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
          {/* Ambient glow */}
          <div className={`sp-hero-glow ug-${u}`} />

          {/* Top row */}
          <div className="sp-hero-top">
            <div className="sp-hero-left">
              <div className="sp-hero-label">{activeBus === 0 ? 'Next Bus' : `Bus ${activeBus + 1}`}</div>
              <div className={`sp-hero-num un-${u}`}>{bus.busNumber}</div>
              {bus.busName && <div className="sp-hero-sub">{bus.busName}</div>}
              <div className="sp-hero-route">Route {bus.routeNumber} — {bus.routeName}</div>
            </div>

            {/* ETA orb */}
            <div className={`sp-eta-orb uo-${u}`}>
              <div className={`sp-eta-orb-ring uor-${u}`} />
              <span className="sp-eta-num">{fmtMin(bus.etaMinutes)}</span>
              <span className="sp-eta-sub">{bus.etaMinutes === 0 ? 'arriving' : myPos ? 'bus ETA' : 'away'}</span>
            </div>
          </div>

          {/* Journey breakdown — passenger mode */}
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

          {/* Progress bar */}
          <div className="sp-prog">
            <div className="sp-prog-track">
              <div className={`sp-prog-fill upf-${u}`}
                style={{ width: `${etaPct(bus.etaMinutes)}%` }} />
              {/* Moving dot on fill */}
              <div className={`sp-prog-dot upd-${u}`}
                style={{ left: `${etaPct(bus.etaMinutes)}%` }} />
            </div>
            <div className="sp-prog-labels">
              <span className={`upt-${u}`}>{fmtLong(bus.etaMinutes)}</span>
              <span className="sp-muted">30 min</span>
            </div>
          </div>

          {/* Stats */}
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
          {isRefreshing ? <><div className="spinner" /> Refreshing…</> : '↻ Refresh'}
        </button>
        <Link to="/" className="sp-back">← All stops</Link>
      </footer>
    </div>
  );
}
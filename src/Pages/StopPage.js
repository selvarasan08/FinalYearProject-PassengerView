import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getBusesForStop } from '../services/Api';
import './StopPage.css';

/* ─── Leaflet icon fix ───────────────────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ─── Custom map icons ───────────────────────────────────────────────────── */
const dIcon = (html, size, anchor) =>
  L.divIcon({ html, className: '', iconSize: size, iconAnchor: anchor });

// Animated bus marker with number label
const busIcon = (num) => dIcon(`
  <div class="mi-bus">
    <div class="mi-bus-ring"></div>
    <div class="mi-bus-emoji">🚌</div>
    <div class="mi-bus-label">${num}</div>
  </div>`, [56, 68], [28, 60]);

// Scanned stop — blue diamond pin
const stopPinIcon = dIcon(`
  <div class="mi-stop-pin">
    <div class="mi-stop-ring"></div>
    <div class="mi-stop-diamond"></div>
  </div>`, [28, 36], [14, 36]);

// Passenger — pulsing teal dot
const passengerIcon = dIcon(`
  <div class="mi-passenger">
    <div class="mi-passenger-ring1"></div>
    <div class="mi-passenger-ring2"></div>
    <div class="mi-passenger-dot"></div>
    <div class="mi-passenger-label">You</div>
  </div>`, [48, 56], [24, 48]);

// Route stop dots
const dotUpcoming = dIcon(`<div class="mi-dot upcoming"></div>`, [12, 12], [6, 6]);
const dotPassed   = dIcon(`<div class="mi-dot passed"></div>`,   [8,  8],  [4, 4]);

/* ─── Map auto-fit ───────────────────────────────────────────────────────── */
function AutoFit({ points }) {
  const map    = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!points?.length || fitted.current) return;
    try {
      map.fitBounds(L.latLngBounds(points), { padding: [52, 52], maxZoom: 15 });
      fitted.current = true;
    } catch (_) {}
  }, [points, map]);
  return null;
}

/* ─── Haversine (client-side, for display only) ──────────────────────────── */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2);
}

const REFRESH = 10;

// Location permission states
const LOC = { IDLE: 'idle', ASKING: 'asking', GRANTED: 'granted', DENIED: 'denied', UNSUPPORTED: 'unsupported' };

export default function StopPage() {
  const { stopId } = useParams();

  // Data
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdown,    setCountdown]    = useState(REFRESH);
  const [activeBus,    setActiveBus]    = useState(0);

  // Geolocation
  const [locState,  setLocState]  = useState(LOC.IDLE);
  const [myPos,     setMyPos]     = useState(null);   // { lat, lng, accuracy }
  const watchRef   = useRef(null);
  const timerRef   = useRef(null);
  const countRef   = useRef(null);

  // ── Fetch buses, pass passenger coords if we have them ──────────────────
  const fetchData = useCallback(async (spinner = false, coords = null) => {
    if (spinner) setIsRefreshing(true);
    const pos = coords ?? myPos;
    try {
      const { data: res } = await getBusesForStop(stopId, pos?.lat, pos?.lng);
      setData(res);
      setLastRefresh(new Date());
      setCountdown(REFRESH);
      setError('');
    } catch {
      setError('Could not reach server.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [stopId, myPos]);

  // ── Auto-refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(() => fetchData(), REFRESH * 1000);
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH : c - 1), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current); };
  }, [fetchData]);

  // Re-fetch immediately when passenger position changes
  useEffect(() => {
    if (myPos) fetchData(false, myPos);
  }, [myPos]); // eslint-disable-line

  // ── Geolocation: ask for permission ──────────────────────────────────────
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocState(LOC.UNSUPPORTED);
      return;
    }
    setLocState(LOC.ASKING);

    // Watch position (continuous updates as user moves)
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setMyPos(coords);
        setLocState(LOC.GRANTED);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setLocState(err.code === 1 ? LOC.DENIED : LOC.UNSUPPORTED);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setMyPos(null);
    setLocState(LOC.IDLE);
  }, []);

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  // ── ETA helpers ──────────────────────────────────────────────────────────
  const urgency = (m) => m <= 2 ? 'red' : m <= 5 ? 'amber' : 'green';
  const fmtMin  = (m) => m === 0 ? 'Now!' : m === 1 ? '1 min' : `${m} min`;
  const fmtLong = (m) => m === 0 ? 'Arriving now' : `${m} min${m !== 1 ? 's' : ''} away`;
  const etaPct  = (m) => Math.max(5, Math.min(100, 100 - (m / 30) * 100));

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="sp-screen">
      <div className="sp-bounce">🚌</div>
      <p className="sp-hint-txt">Finding buses near you…</p>
      <div className="sp-bar"><div className="sp-bar-fill" /></div>
    </div>
  );

  if (error && !data) return (
    <div className="sp-screen">
      <span className="sp-icon-lg">📡</span>
      <h2>Connection lost</h2>
      <p className="sp-muted">{error}</p>
      <button className="sp-btn-primary" onClick={() => fetchData(true)}>Retry</button>
    </div>
  );

  const { stop, buses, passenger: psgr } = data || {};
  const bus  = buses?.[activeBus] ?? buses?.[0];
  const poly = bus?.routePolyline ?? [];

  // Map points
  const myLL      = myPos ? [myPos.lat, myPos.lng] : null;
  const busLL     = bus?.currentLocation?.coordinates?.length === 2
    ? [bus.currentLocation.coordinates[1], bus.currentLocation.coordinates[0]]
    : null;
  const myStopPt  = poly.find(p => p.isScannedStop);
  const stopLL    = myStopPt ? [myStopPt.lat, myStopPt.lng] : null;

  const passedLL = poly.filter(p =>  p.isPassed).map(p => [p.lat, p.lng]);
  const aheadLL  = poly.filter(p => !p.isPassed).map(p => [p.lat, p.lng]);

  // Fit all visible points — bus + route + passenger
  const fitPoints = [
    ...poly.map(p => [p.lat, p.lng]),
    ...(busLL  ? [busLL]  : []),
    ...(myLL   ? [myLL]   : []),
  ];

  const mapCenter = myLL ?? stopLL ?? fitPoints[0] ?? [13.0827, 80.2707];

  // Walk line: passenger → stop
  const walkLine = myLL && stopLL ? [myLL, stopLL] : null;

  // Live distance passenger → bus (client-side, just for display)
  const liveDistToBus = myPos && busLL
    ? haversine(myPos.lat, myPos.lng, busLL[0], busLL[1])
    : null;

  return (
    <div className="sp-page">

      {/* ═══ STOP HEADER ════════════════════════════════════════════════ */}
      <header className="sp-header card">
        <div className="sp-header-left">
          <div className="sp-stop-icon">🚏</div>
          <div>
            <h1 className="sp-stop-name">{stop?.name}</h1>
            <div className="sp-stop-meta">
              <span className="sp-code">{stop?.stopCode}</span>
              {stop?.address && <span className="sp-addr">{stop.address}</span>}
            </div>
          </div>
        </div>
        <div className="sp-live-chip">
          <span className="sp-live-dot" />
          <span>{countdown}s</span>
        </div>
      </header>

      {/* ═══ LOCATION BANNER ════════════════════════════════════════════ */}
      {locState === LOC.IDLE && (
        <div className="sp-loc-banner card">
          <div className="sp-loc-banner-left">
            <span className="sp-loc-icon">📍</span>
            <div>
              <div className="sp-loc-title">Get personalised ETAs</div>
              <div className="sp-loc-sub">Share your location for door-to-bus timing, walking distance and live tracking on the map.</div>
            </div>
          </div>
          <button className="sp-btn-location" onClick={requestLocation}>
            Share Location
          </button>
        </div>
      )}

      {locState === LOC.ASKING && (
        <div className="sp-loc-banner card asking">
          <span className="sp-loc-icon spin">⟳</span>
          <span className="sp-loc-title">Requesting your location…</span>
        </div>
      )}

      {locState === LOC.DENIED && (
        <div className="sp-loc-banner card denied">
          <span className="sp-loc-icon">🚫</span>
          <div>
            <div className="sp-loc-title">Location access denied</div>
            <div className="sp-loc-sub">Enable location in your browser settings for personalised ETAs.</div>
          </div>
        </div>
      )}

      {locState === LOC.GRANTED && myPos && (
        <div className="sp-loc-active card">
          <div className="sp-loc-active-left">
            <span className="sp-loc-active-dot" />
            <div>
              <div className="sp-loc-active-title">📍 Location active</div>
              {psgr && (
                <div className="sp-loc-active-sub">
                  <span>🚶 {psgr.walkingDistanceKm} km to stop</span>
                  <span className="sp-loc-sep">·</span>
                  <span>~{psgr.walkingMinutes} min walk</span>
                  {myPos.accuracy && <span className="sp-loc-sep">·</span>}
                  {myPos.accuracy && <span>±{Math.round(myPos.accuracy)}m</span>}
                </div>
              )}
            </div>
          </div>
          <button className="sp-loc-stop-btn" onClick={stopTracking} title="Stop sharing location">✕</button>
        </div>
      )}

      {/* ═══ NO BUSES ═══════════════════════════════════════════════════ */}
      {!buses?.length && (
        <div className="sp-empty card">
          <span className="sp-icon-lg">🔍</span>
          <h2>No buses approaching</h2>
          <p>Nothing heading to <strong>{stop?.name}</strong> right now.</p>
          <p className="sp-muted">Auto-refreshes every {REFRESH}s</p>
        </div>
      )}

      {/* ═══ LIVE MAP ═══════════════════════════════════════════════════ */}
      {buses?.length > 0 && (
        <div className="sp-map-card card">

          <div className="sp-map-topbar">
            <span className="sp-map-title">🗺 Live Route Map</span>
            {bus && <span className="sp-map-badge">🚌 {bus.busNumber} · Rte {bus.routeNumber}</span>}
          </div>

          <div className="sp-mapbox">
            {fitPoints.length > 0 ? (
              <MapContainer
                center={mapCenter}
                zoom={14}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={false}
                zoomControl={true}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
                />
                {fitPoints.length > 1 && <AutoFit points={fitPoints} />}

                {/* Passed route — grey dashes */}
                {passedLL.length > 1 && (
                  <Polyline positions={passedLL}
                    pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.38, dashArray: '5 8' }} />
                )}

                {/* Ahead route — vivid blue */}
                {aheadLL.length > 1 && (
                  <Polyline positions={aheadLL}
                    pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.9 }} />
                )}

                {/* Walk line: passenger → stop (dashed teal) */}
                {walkLine && (
                  <Polyline positions={walkLine}
                    pathOptions={{ color: '#0d9488', weight: 3, opacity: 0.75, dashArray: '8 6' }} />
                )}

                {/* Route stop markers */}
                {poly.map((pt, i) =>
                  pt.isScannedStop ? (
                    <React.Fragment key={i}>
                      <Circle center={[pt.lat, pt.lng]} radius={85}
                        pathOptions={{ color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 0.25, weight: 2 }} />
                      <Marker position={[pt.lat, pt.lng]} icon={stopPinIcon}>
                        <Popup offset={[0, -20]}>
                          <strong>{pt.name}</strong><br />
                          <span style={{ color: '#2563eb' }}>📍 Scanned stop</span>
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  ) : (
                    <Marker key={i} position={[pt.lat, pt.lng]} icon={pt.isPassed ? dotPassed : dotUpcoming}>
                      <Popup><strong>{pt.name}</strong><br /><small>{pt.isPassed ? '✓ Passed' : '↑ Upcoming'}</small></Popup>
                    </Marker>
                  )
                )}

                {/* Bus marker */}
                {busLL && (
                  <>
                    <Circle center={busLL} radius={100}
                      pathOptions={{ color: '#16a34a', fillColor: '#4ade80', fillOpacity: 0.15, weight: 0 }} />
                    <Marker position={busLL} icon={busIcon(bus.busNumber)}>
                      <Popup offset={[0, -56]}>
                        <strong>🚌 {bus.busNumber}</strong><br />
                        {bus.speed || 0} km/h · {fmtLong(bus.etaMinutes)}
                      </Popup>
                    </Marker>
                  </>
                )}

                {/* Passenger marker */}
                {myLL && (
                  <>
                    {myPos.accuracy && (
                      <Circle center={myLL} radius={Math.min(myPos.accuracy, 200)}
                        pathOptions={{ color: '#0d9488', fillColor: '#5eead4', fillOpacity: 0.15, weight: 1.5 }} />
                    )}
                    <Marker position={myLL} icon={passengerIcon}>
                      <Popup offset={[0, -44]}>
                        <strong>📍 You're here</strong><br />
                        {liveDistToBus !== null && `${liveDistToBus} km from bus`}
                      </Popup>
                    </Marker>
                  </>
                )}
              </MapContainer>
            ) : (
              <div className="sp-map-nodata"><span>🗺</span><p>Map unavailable</p></div>
            )}

            {/* Legend */}
            <div className="sp-legend">
              <span className="leg"><span className="leg-line blue" />Bus route</span>
              <span className="leg"><span className="leg-dot green" />Bus</span>
              <span className="leg"><span className="leg-dot blue" />Stop</span>
              {myLL && <span className="leg"><span className="leg-dot teal" />You</span>}
              {myLL && <span className="leg"><span className="leg-line teal dashed" />Walk</span>}
            </div>
          </div>

          {/* Route breadcrumb strip */}
          {poly.length > 0 && (
            <div className="sp-strip">
              {poly.map((pt, i) => (
                <React.Fragment key={i}>
                  <span className={`sp-chip ${pt.isScannedStop ? 'stop' : pt.isPassed ? 'done' : ''}`}>
                    {pt.isScannedStop ? '📍 ' : ''}{pt.name}
                  </span>
                  {i < poly.length - 1 && <span className="sp-chip-arr">›</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ BUS SELECTOR TABS ══════════════════════════════════════════ */}
      {buses?.length > 1 && (
        <div className="sp-tabs">
          {buses.map((b, i) => (
            <button key={b._id}
              className={`sp-tab ${activeBus === i ? 'active' : ''} t-${urgency(b.etaMinutes)}`}
              onClick={() => setActiveBus(i)}>
              {i === 0 && <span className="sp-tab-badge">Next</span>}
              <span className="sp-tab-num">{b.busNumber}</span>
              <span className="sp-tab-eta">{fmtMin(b.etaMinutes)}</span>
            </button>
          ))}
        </div>
      )}

      {/* ═══ BUS HERO CARD ══════════════════════════════════════════════ */}
      {bus && (
        <div className={`sp-hero card h-${urgency(bus.etaMinutes)}`}>

          {/* ── Header row ── */}
          <div className="sp-hero-top">
            <div>
              <div className="sp-hero-tag">{activeBus === 0 ? 'Next Bus' : `Bus ${activeBus + 1}`}</div>
              <div className="sp-hero-num">{bus.busNumber}</div>
              {bus.busName && <div className="sp-hero-sub">{bus.busName}</div>}
              <div className="sp-hero-route">Route {bus.routeNumber} — {bus.routeName}</div>
            </div>

            {/* ETA blob — passenger mode shows total journey */}
            <div className={`sp-eta-blob e-${urgency(bus.etaMinutes)}`}>
              {myPos ? (
                <>
                  <span className="sp-eta-main">{fmtMin(bus.etaMinutes)}</span>
                  <span className="sp-eta-label">bus arrives</span>
                </>
              ) : (
                <>
                  <span className="sp-eta-main">{fmtMin(bus.etaMinutes)}</span>
                  <span className="sp-eta-label">{bus.etaMinutes === 0 ? 'arriving' : 'away'}</span>
                </>
              )}
            </div>
          </div>

          {/* ── Total journey card (passenger mode only) ── */}
          {myPos && psgr && (
            <div className="sp-journey-row">
              <div className="sp-journey-step">
                <span className="sp-journey-icon">🚌</span>
                <div>
                  <div className="sp-journey-val">{fmtMin(bus.etaMinutes)}</div>
                  <div className="sp-journey-lbl">bus arrives at stop</div>
                </div>
              </div>
              <span className="sp-journey-plus">+</span>
              <div className="sp-journey-step">
                <span className="sp-journey-icon">🚶</span>
                <div>
                  <div className="sp-journey-val">{psgr.walkingMinutes} min</div>
                  <div className="sp-journey-lbl">walk to stop</div>
                </div>
              </div>
              <span className="sp-journey-plus">=</span>
              <div className={`sp-journey-total e-${urgency(bus.totalJourneyMinutes)}`}>
                <div className="sp-journey-val bold">{fmtMin(bus.totalJourneyMinutes)}</div>
                <div className="sp-journey-lbl">total journey</div>
              </div>
            </div>
          )}

          {/* ── Progress bar ── */}
          <div className="sp-prog">
            <div className="sp-prog-track">
              <div className={`sp-prog-fill pf-${urgency(bus.etaMinutes)}`}
                style={{ width: `${etaPct(bus.etaMinutes)}%` }} />
            </div>
            <div className="sp-prog-labels">
              <span className={`pt-${urgency(bus.etaMinutes)}`}>{fmtLong(bus.etaMinutes)}</span>
              <span className="sp-muted">30 min</span>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="sp-stats">
            {myPos ? (
              /* Passenger mode stats */
              <>
                <div className="sp-stat">
                  <span className="sp-stat-icon">📍</span>
                  <span className="sp-stat-v">{liveDistToBus ?? bus.distanceKm} km</span>
                  <span className="sp-stat-l">to bus</span>
                </div>
                <div className="sp-stat-sep" />
                <div className="sp-stat">
                  <span className="sp-stat-icon">🚶</span>
                  <span className="sp-stat-v">{psgr?.walkingDistanceKm ?? '—'} km</span>
                  <span className="sp-stat-l">to stop</span>
                </div>
                <div className="sp-stat-sep" />
                <div className="sp-stat">
                  <span className="sp-stat-icon">🚦</span>
                  <span className="sp-stat-v">{bus.stopsAway}</span>
                  <span className="sp-stat-l">stop{bus.stopsAway !== 1 ? 's' : ''}</span>
                </div>
                <div className="sp-stat-sep" />
                <div className="sp-stat">
                  <span className="sp-stat-icon">⚡</span>
                  <span className="sp-stat-v">{bus.speed || 0}</span>
                  <span className="sp-stat-l">km/h</span>
                </div>
              </>
            ) : (
              /* Default stats */
              <>
                <div className="sp-stat">
                  <span className="sp-stat-icon">📍</span>
                  <span className="sp-stat-v">{bus.distanceKm} km</span>
                  <span className="sp-stat-l">away</span>
                </div>
                <div className="sp-stat-sep" />
                <div className="sp-stat">
                  <span className="sp-stat-icon">🚦</span>
                  <span className="sp-stat-v">{bus.stopsAway}</span>
                  <span className="sp-stat-l">stop{bus.stopsAway !== 1 ? 's' : ''}</span>
                </div>
                <div className="sp-stat-sep" />
                <div className="sp-stat">
                  <span className="sp-stat-icon">⚡</span>
                  <span className="sp-stat-v">{bus.speed || 0}</span>
                  <span className="sp-stat-l">km/h</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═════════════════════════════════════════════════════ */}
      <footer className="sp-footer">
        {lastRefresh && <span className="sp-muted">Updated {lastRefresh.toLocaleTimeString()}</span>}
        <button className="sp-refresh-btn" onClick={() => fetchData(true)} disabled={isRefreshing}>
          {isRefreshing ? '↻ Refreshing…' : '↻ Refresh now'}
        </button>
        <Link to="/" className="sp-back-link">← All stops</Link>
      </footer>

    </div>
  );
}
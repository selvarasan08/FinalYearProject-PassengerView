import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getBusesForStop } from '../services/Api';
import './StopPage.css';

/* ─── Fix Leaflet default icon paths ──────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ─── Custom map icons ─────────────────────────────────────────────────────── */
const divIcon = (html, size, anchor) =>
  L.divIcon({ html, className: '', iconSize: size, iconAnchor: anchor });

const busIcon = (busNumber) => divIcon(`
  <div class="mi-bus">
    <div class="mi-bus-ring"></div>
    <div class="mi-bus-body">🚌</div>
    <div class="mi-bus-label">${busNumber}</div>
  </div>`, [56, 64], [28, 56]);

const myStopIcon = divIcon(`
  <div class="mi-mystop">
    <div class="mi-mystop-ring"></div>
    <div class="mi-mystop-pin"></div>
  </div>`, [32, 40], [16, 40]);

const stopDot    = divIcon(`<div class="mi-dot upcoming"></div>`, [12, 12], [6, 6]);
const passedDot  = divIcon(`<div class="mi-dot passed"></div>`,  [8,  8],  [4, 4]);

/* ─── Auto-fit map bounds ──────────────────────────────────────────────────── */
function AutoFit({ points }) {
  const map    = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!points?.length || fitted.current) return;
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
    fitted.current = true;
  }, [points, map]);
  return null;
}

const REFRESH = 10;

export default function StopPage() {
  const { stopId } = useParams();
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [countdown,    setCountdown]    = useState(REFRESH);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const [activeBus,    setActiveBus]    = useState(0);
  const timerRef = useRef(null);
  const countRef = useRef(null);

  const fetchData = useCallback(async (spinner = false) => {
    if (spinner) setIsRefreshing(true);
    try {
      const { data: res } = await getBusesForStop(stopId);
      setData(res);
      setLastRefresh(new Date());
      setCountdown(REFRESH);
      setError('');
    } catch { setError('Could not reach server. Check your connection.'); }
    finally   { setLoading(false); setIsRefreshing(false); }
  }, [stopId]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(() => fetchData(), REFRESH * 1000);
    countRef.current = setInterval(() => setCountdown(c => c <= 1 ? REFRESH : c - 1), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current); };
  }, [fetchData]);

  /* ── ETA helpers ──────────────────────────────────────────────────────── */
  const urgency  = (m) => m <= 2 ? 'red' : m <= 5 ? 'amber' : 'green';
  const etaShort = (m) => m === 0 ? 'Now!' : m === 1 ? '1 min' : `${m} min`;
  const etaLong  = (m) => m === 0 ? 'Arriving now' : `${m} min${m !== 1 ? 's' : ''} away`;
  const etaPct   = (m) => Math.max(5, Math.min(100, 100 - (m / 30) * 100));

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="sp-center">
      <div className="sp-bus-hop">🚌</div>
      <p className="sp-loading-txt">Finding buses near you…</p>
      <div className="sp-bar"><div className="sp-bar-fill" /></div>
    </div>
  );

  if (error && !data) return (
    <div className="sp-center">
      <span className="sp-icon-xl">📡</span>
      <h2>Connection lost</h2>
      <p className="sp-muted">{error}</p>
      <button className="btn-primary" onClick={() => fetchData(true)}>Retry</button>
    </div>
  );

  const { stop, buses } = data || {};
  const bus  = buses?.[activeBus] ?? buses?.[0];
  const poly = bus?.routePolyline ?? [];

  const passedLL = poly.filter(p =>  p.isPassed).map(p => [p.lat, p.lng]);
  const aheadLL  = poly.filter(p => !p.isPassed).map(p => [p.lat, p.lng]);
  const myStopPt = poly.find(p => p.isScannedStop);
  const busLL    = bus?.currentLocation?.coordinates?.length === 2
    ? [bus.currentLocation.coordinates[1], bus.currentLocation.coordinates[0]]
    : null;

  const fitPoints = [...poly.map(p => [p.lat, p.lng]), ...(busLL ? [busLL] : [])];
  const mapCenter = myStopPt ? [myStopPt.lat, myStopPt.lng] : fitPoints[0] ?? [13.0827, 80.2707];

  return (
    <div className="sp-page">

      {/* ═══ STOP HEADER ════════════════════════════════════════════════════ */}
      <header className="sp-header card">
        <div className="sp-header-left">
          <div className="sp-stop-pin">🚏</div>
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

      {/* ═══ NO BUSES ══════════════════════════════════════════════════════ */}
      {!buses?.length && (
        <div className="sp-empty card">
          <span className="sp-icon-xl">🔍</span>
          <h2>No buses approaching</h2>
          <p>Nothing heading to <strong>{stop?.name}</strong> right now.</p>
          <p className="sp-muted">Auto-refreshes every {REFRESH}s</p>
        </div>
      )}

      {/* ═══ MAP ════════════════════════════════════════════════════════════ */}
      {buses?.length > 0 && (
        <div className="sp-map-card card">

          {/* Map header */}
          <div className="sp-map-topbar">
            <span className="sp-map-title">🗺 Live Route Map</span>
            {bus && (
              <span className="sp-map-badge">
                🚌 {bus.busNumber} · Rte {bus.routeNumber}
              </span>
            )}
          </div>

          {/* Map container */}
          <div className="sp-mapbox">
            {poly.length > 0 ? (
              <MapContainer
                center={mapCenter}
                zoom={13}
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
                  <Polyline
                    positions={passedLL}
                    pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.4, dashArray: '5 8' }}
                  />
                )}

                {/* Ahead route — vivid blue */}
                {aheadLL.length > 1 && (
                  <Polyline
                    positions={aheadLL}
                    pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.88 }}
                  />
                )}

                {/* Route stops */}
                {poly.map((pt, i) =>
                  pt.isScannedStop ? (
                    <React.Fragment key={i}>
                      <Circle
                        center={[pt.lat, pt.lng]}
                        radius={90}
                        pathOptions={{ color: '#2563eb', fillColor: '#93c5fd', fillOpacity: 0.28, weight: 2 }}
                      />
                      <Marker position={[pt.lat, pt.lng]} icon={myStopIcon}>
                        <Popup offset={[0, -18]}>
                          <strong>{pt.name}</strong><br />
                          <span style={{ color: '#2563eb' }}>📍 Your stop</span>
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  ) : (
                    <Marker key={i} position={[pt.lat, pt.lng]} icon={pt.isPassed ? passedDot : stopDot}>
                      <Popup>
                        <strong>{pt.name}</strong><br />
                        <small>{pt.isPassed ? '✓ Passed' : '↑ Upcoming'}</small>
                      </Popup>
                    </Marker>
                  )
                )}

                {/* Bus marker */}
                {busLL && (
                  <>
                    <Circle
                      center={busLL}
                      radius={110}
                      pathOptions={{ color: '#16a34a', fillColor: '#4ade80', fillOpacity: 0.18, weight: 0 }}
                    />
                    <Marker position={busLL} icon={busIcon(bus.busNumber)}>
                      <Popup offset={[0, -52]}>
                        <strong>🚌 {bus.busNumber}</strong><br />
                        {bus.speed || 0} km/h · {etaLong(bus.etaMinutes)}
                      </Popup>
                    </Marker>
                  </>
                )}
              </MapContainer>
            ) : (
              <div className="sp-map-nodata">
                <span>🗺</span>
                <p>Route map unavailable</p>
              </div>
            )}

            {/* Legend */}
            <div className="sp-legend">
              <span className="leg-item"><span className="leg-line blue" />Ahead</span>
              <span className="leg-item"><span className="leg-line grey" />Passed</span>
              <span className="leg-item"><span className="leg-dot green" />Bus</span>
              <span className="leg-item"><span className="leg-dot blue" />Your stop</span>
            </div>
          </div>

          {/* Route stop breadcrumb strip */}
          {poly.length > 0 && (
            <div className="sp-strip">
              {poly.map((pt, i) => (
                <React.Fragment key={i}>
                  <span className={`sp-chip ${pt.isScannedStop ? 'you' : pt.isPassed ? 'done' : ''}`}>
                    {pt.isScannedStop ? '📍 ' : ''}{pt.name}
                  </span>
                  {i < poly.length - 1 && <span className="sp-chip-arr">›</span>}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ BUS SELECTOR TABS ══════════════════════════════════════════════ */}
      {buses?.length > 1 && (
        <div className="sp-tabs">
          {buses.map((b, i) => (
            <button
              key={b._id}
              className={`sp-tab ${activeBus === i ? 'active' : ''} sp-tab-${urgency(b.etaMinutes)}`}
              onClick={() => setActiveBus(i)}
            >
              {i === 0 && <span className="sp-tab-next">Next</span>}
              <span className="sp-tab-num">{b.busNumber}</span>
              <span className="sp-tab-eta">{etaShort(b.etaMinutes)}</span>
            </button>
          ))}
        </div>
      )}

      {/* ═══ BUS HERO CARD ══════════════════════════════════════════════════ */}
      {bus && (
        <div className={`sp-hero card sp-hero-${urgency(bus.etaMinutes)}`}>

          <div className="sp-hero-top">
            <div className="sp-hero-left">
              <div className="sp-hero-label">
                {activeBus === 0 ? 'Next Bus' : `Bus ${activeBus + 1}`}
              </div>
              <div className="sp-hero-num">{bus.busNumber}</div>
              {bus.busName && <div className="sp-hero-sub">{bus.busName}</div>}
              <div className="sp-hero-route">Route {bus.routeNumber} — {bus.routeName}</div>
            </div>

            <div className={`sp-eta-blob sp-eta-${urgency(bus.etaMinutes)}`}>
              <span className="sp-eta-num">{etaShort(bus.etaMinutes)}</span>
              <span className="sp-eta-away">{bus.etaMinutes === 0 ? 'arriving' : 'away'}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="sp-prog">
            <div className="sp-prog-track">
              <div
                className={`sp-prog-fill sp-pf-${urgency(bus.etaMinutes)}`}
                style={{ width: `${etaPct(bus.etaMinutes)}%` }}
              />
            </div>
            <div className="sp-prog-labels">
              <span className={`sp-prog-left sp-pt-${urgency(bus.etaMinutes)}`}>{etaLong(bus.etaMinutes)}</span>
              <span className="sp-muted">30 min</span>
            </div>
          </div>

          {/* Stats */}
          <div className="sp-stats">
            <div className="sp-stat">
              <span className="sp-stat-i">📍</span>
              <span className="sp-stat-v">{bus.distanceKm} km</span>
              <span className="sp-stat-l">away</span>
            </div>
            <div className="sp-stat-sep" />
            <div className="sp-stat">
              <span className="sp-stat-i">🚦</span>
              <span className="sp-stat-v">{bus.stopsAway}</span>
              <span className="sp-stat-l">stop{bus.stopsAway !== 1 ? 's' : ''}</span>
            </div>
            <div className="sp-stat-sep" />
            <div className="sp-stat">
              <span className="sp-stat-i">⚡</span>
              <span className="sp-stat-v">{bus.speed || 0}</span>
              <span className="sp-stat-l">km/h</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═════════════════════════════════════════════════════════ */}
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
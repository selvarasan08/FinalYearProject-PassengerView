import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getAllStops, getAllBuses } from '../services/Api';
import './AllStopsPage.css';

/* ─── Leaflet icon fix ───────────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ─── CUSTOM MAP ICONS ────────────────────────────────────────────────
   Pure SVG + CSS animations injected via Leaflet divIcon.
   All rendered client-side, no image files needed.
   ─────────────────────────────────────────────────────────────────── */

// 🚏 Bus Stop — Hexagonal beacon with radar ping
const makeStopIcon = () => L.divIcon({
  className: '',
  iconSize:  [44, 52],
  iconAnchor:[22, 52],
  html: `
    <style>
      .msi-wrap{position:relative;width:44px;height:52px;display:flex;flex-direction:column;align-items:center;}
      .msi-pulse{position:absolute;top:4px;left:50%;transform:translateX(-50%);
        width:36px;height:36px;border-radius:50%;
        border:2px solid rgba(255,159,10,0.5);
        animation:msiPing 2.5s ease-out infinite;}
      .msi-pulse2{animation-delay:1.25s;}
      @keyframes msiPing{0%{transform:translateX(-50%) scale(.6);opacity:.9;}100%{transform:translateX(-50%) scale(2);opacity:0;}}
      .msi-hex{
        width:36px;height:36px;
        background:linear-gradient(135deg,#ff9f0a,#ff6b00);
        clip-path:polygon(50% 0%,95% 25%,95% 75%,50% 100%,5% 75%,5% 25%);
        display:flex;align-items:center;justify-content:center;
        position:relative;z-index:2;
        box-shadow:0 4px 16px rgba(255,159,10,0.5);
      }
      .msi-letter{font-family:'Space Mono',monospace;font-size:1rem;font-weight:700;color:#0a0600;line-height:1;}
      .msi-tail{width:2px;height:14px;background:linear-gradient(to bottom,#ff9f0a,transparent);margin-top:-1px;border-radius:1px;position:relative;z-index:1;}
    </style>
    <div class="msi-wrap">
      <div class="msi-pulse"></div>
      <div class="msi-pulse msi-pulse2"></div>
      <div class="msi-hex"><span class="msi-letter">🚏</span></div>
      <div class="msi-tail"></div>
    </div>
  `
});

// 🚌 Active Bus — animated bus body with speed lines
const makeBusIcon = (busNumber, speed) => L.divIcon({
  className: '',
  iconSize:  [68, 52],
  iconAnchor:[34, 44],
  html: `
    <style>
      .mbi-wrap{position:relative;display:flex;flex-direction:column;align-items:center;width:68px;}
      .mbi-shadow{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);
        width:48px;height:8px;background:rgba(0,214,143,0.2);border-radius:50%;
        filter:blur(4px);animation:mbiShadow 1.2s ease-in-out infinite alternate;}
      @keyframes mbiShadow{from{transform:translateX(-50%) scaleX(.8);}to{transform:translateX(-50%) scaleX(1.1);}}
      .mbi-body{
        background:linear-gradient(160deg,#0e2a4a 0%,#0a1e35 100%);
        border:2px solid #00d68f;
        border-radius:10px;
        padding:5px 10px;
        display:flex;flex-direction:column;align-items:center;
        gap:2px;position:relative;z-index:2;
        box-shadow:0 0 0 1px rgba(0,214,143,0.3), 0 6px 24px rgba(0,0,0,0.7), 0 0 16px rgba(0,214,143,0.2);
        min-width:56px;
        animation:mbiFloat 2.4s ease-in-out infinite alternate;
      }
      @keyframes mbiFloat{from{transform:translateY(0);}to{transform:translateY(-4px);}}
      .mbi-top{display:flex;align-items:center;gap:4px;}
      .mbi-emoji{font-size:1.3rem;line-height:1;filter:drop-shadow(0 0 6px rgba(0,214,143,0.6));}
      .mbi-num{font-family:'Space Mono',monospace;font-size:0.68rem;font-weight:700;color:#00d68f;letter-spacing:.02em;white-space:nowrap;}
      .mbi-speed{font-size:0.58rem;color:rgba(0,214,143,0.6);font-family:monospace;white-space:nowrap;}
      /* Speed lines */
      .mbi-lines{position:absolute;left:-14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3px;}
      .mbi-line{height:1.5px;border-radius:1px;background:linear-gradient(90deg,transparent,#00d68f);
        animation:mbiLine 0.8s ease-in-out infinite;}
      .mbi-line:nth-child(1){width:10px;animation-delay:0s;}
      .mbi-line:nth-child(2){width:7px;animation-delay:.15s;}
      .mbi-line:nth-child(3){width:5px;animation-delay:.3s;}
      @keyframes mbiLine{0%,100%{opacity:.3;transform:scaleX(.6);}50%{opacity:1;transform:scaleX(1);}}
      /* Tail arrow */
      .mbi-arrow{width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #00d68f;margin-top:-2px;position:relative;z-index:1;opacity:.9;}
    </style>
    <div class="mbi-wrap">
      <div class="mbi-shadow"></div>
      <div class="mbi-body">
        <div class="mbi-lines">
          <div class="mbi-line"></div>
          <div class="mbi-line"></div>
          <div class="mbi-line"></div>
        </div>
        <div class="mbi-top">
          <span class="mbi-emoji">🚌</span>
          <span class="mbi-num">${busNumber}</span>
        </div>
        ${speed > 0 ? `<div class="mbi-speed">${speed} km/h</div>` : ''}
      </div>
      <div class="mbi-arrow"></div>
    </div>
  `
});

/* ─── Component ──────────────────────────────────────────────────── */
export default function AllStopsPage() {
  const [stops,   setStops]   = useState([]);
  const [buses,   setBuses]   = useState([]);
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const [s, b] = await Promise.all([getAllStops(), getAllBuses()]);
      setStops(s.data);
      setBuses(b.data);
      setLoading(false);
    };
    init();
    const iv = setInterval(async () => {
      const { data } = await getAllBuses();
      setBuses(data);
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  const filtered = stops.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.stopCode.toLowerCase().includes(search.toLowerCase()) ||
    (s.address || '').toLowerCase().includes(search.toLowerCase())
  );

  const mapCenter = stops.length > 0
    ? [stops[0].location.coordinates[1], stops[0].location.coordinates[0]]
    : [13.0827, 80.2707];

  // Stripe colour cycles
  const stripeClass = (i) => `s${i % 4}`;

  return (
    <div className="asp-page">

      {/* ═══ HERO ════════════════════════════════════════════════ */}
      <div className="asp-hero">
        <h1 className="asp-title">Track Your Bus</h1>
        <p className="asp-sub">
          Scan the <strong>QR code</strong> at any stop — or search below.
        </p>
        <div className="asp-stats-row">
          <div className="asp-stat">
            <span className="asp-stat-num">{buses.length}</span>
            <span className="asp-stat-lbl">Live Buses</span>
          </div>
          <div className="asp-stat-divider" />
          <div className="asp-stat">
            <span className="asp-stat-num">{stops.length}</span>
            <span className="asp-stat-lbl">Bus Stops</span>
          </div>
        </div>
      </div>

      {/* ═══ MAP ════════════════════════════════════════════════ */}
      {!loading && stops.length > 0 && (
        <div className="asp-map-wrap">
          <div className="asp-map-topbar">
            <span className="asp-map-ttl">
              <span className="asp-map-ttl-dot" />
              Live Network Map
            </span>
            <div className="live-badge">
              <span className="live-dot-wrap"><span className="live-dot" /></span>
              {buses.length} active
            </div>
          </div>
          <MapContainer center={mapCenter} zoom={12} style={{ height: 290 }} scrollWheelZoom={false}>
            <TileLayer
              attribution='© OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stops.map(stop => (
              <Marker
                key={stop._id}
                position={[stop.location.coordinates[1], stop.location.coordinates[0]]}
                icon={makeStopIcon()}
              >
                <Popup>
                  <strong>🚏 {stop.name}</strong>
                  <span style={{fontSize:'0.75rem',color:'#4e6285'}}>{stop.stopCode} · {stop.address}</span>
                  <a href={`/stop/${stop._id}`}>View arrivals →</a>
                </Popup>
              </Marker>
            ))}
            {buses.map(bus => {
              const lat = bus.currentLocation?.coordinates[1];
              const lng = bus.currentLocation?.coordinates[0];
              if (!lat || !lng) return null;
              return (
                <Marker key={bus._id} position={[lat, lng]}
                  icon={makeBusIcon(bus.busNumber, bus.speed || 0)}>
                  <Popup>
                    <strong>🚌 {bus.busNumber}</strong>
                    Route {bus.route?.routeNumber} · {bus.speed || 0} km/h
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* ═══ SEARCH ══════════════════════════════════════════════ */}
      <div className="asp-search-wrap">
        <span className="asp-search-icon">🔍</span>
        <input
          className="asp-search"
          type="text"
          placeholder="Search stops by name, code, or area…"
          value={search}
          onChange={e => { setSearch(e.target.value); }}
        />
      </div>

      {search && (
        <div className="asp-result-count">
          <span>{filtered.length}</span> result{filtered.length !== 1 ? 's' : ''} for "{search}"
        </div>
      )}

      {/* ═══ STOP LIST ═══════════════════════════════════════════ */}
      <div className="asp-stop-list">
        {loading ? (
          <div className="asp-loading">
            <div className="spinner" />
            <span>Loading stops…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="asp-empty">
            <span className="asp-empty-icon">🔍</span>
            <p>No stops found for "{search}"</p>
          </div>
        ) : (
          filtered.map((stop, i) => (
            <Link key={stop._id} to={`/stop/${stop._id}`} className="asp-stop-card">
              <div className={`asp-stop-stripe ${stripeClass(i)}`} />
              <div className="asp-stop-icon-col">
                <div className="asp-stop-icon-badge">🚏</div>
              </div>
              <div className="asp-stop-body">
                <div className="asp-stop-name">{stop.name}</div>
                <div className="asp-stop-meta">
                  <span className="asp-stop-code">{stop.stopCode}</span>
                  {stop.address && <span className="asp-stop-addr">{stop.address}</span>}
                </div>
                {stop.routes?.length > 0 && (
                  <div className="asp-route-chips">
                    {stop.routes.map(r => (
                      <span key={r._id} className="asp-route-chip">Rte {r.routeNumber}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="asp-arrow-col">›</div>
            </Link>
          ))
        )}
      </div>

      <div className="asp-footer">
        <p>Tap any stop to see live bus arrivals</p>
        <p>Or scan the QR code at the physical stop</p>
      </div>
    </div>
  );
}
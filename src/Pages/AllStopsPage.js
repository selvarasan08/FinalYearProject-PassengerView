import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getAllStops, getAllBuses } from '../services/Api';
import './AllStopsPage.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const stopIcon = L.divIcon({
  html: `<div style="font-size:1.6rem;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))">🚏</div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const busIcon = L.divIcon({
  html: `<div style="font-size:1.6rem;line-height:1;filter:drop-shadow(0 2px 8px rgba(37,99,235,0.5))">🚌</div>`,
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

export default function AllStopsPage() {
  const [stops, setStops] = useState([]);
  const [buses, setBuses] = useState([]);
  const [search, setSearch] = useState('');
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

  const filteredStops = stops.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.stopCode.toLowerCase().includes(search.toLowerCase()) ||
    (s.address || '').toLowerCase().includes(search.toLowerCase())
  );

  const mapCenter = stops.length > 0
    ? [stops[0].location.coordinates[1], stops[0].location.coordinates[0]]
    : [13.0827, 80.2707];

  return (
    <div className="asp-page">
      {/* Hero */}
      <div className="asp-hero">
        <h1 className="asp-title">Track Your Bus</h1>
        <p className="asp-sub">
          Scan the <strong>QR code</strong> at your bus stop — or find your stop below.
        </p>
        <div className="asp-stats-row">
          <div className="asp-stat">
            <span className="asp-stat-num">{buses.length}</span>
            <span className="asp-stat-lbl">Buses Live</span>
          </div>
          <div className="asp-stat-divider" />
          <div className="asp-stat">
            <span className="asp-stat-num">{stops.length}</span>
            <span className="asp-stat-lbl">Bus Stops</span>
          </div>
        </div>
      </div>

      {/* Live Map */}
      {!loading && stops.length > 0 && (
        <div className="asp-map-wrap">
          <div className="asp-map-label">
            <span>🗺 Live Map</span>
            <div className="live-badge">
              <span className="live-dot-wrap"><span className="live-dot"></span></span>
              {buses.length} active
            </div>
          </div>
          <MapContainer center={mapCenter} zoom={12} style={{ height: 280 }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stops.map(stop => (
              <Marker
                key={stop._id}
                position={[stop.location.coordinates[1], stop.location.coordinates[0]]}
                icon={stopIcon}
              >
                <Popup>
                  <strong>🚏 {stop.name}</strong><br />
                  <a href={`/stop/${stop._id}`}>View arrivals →</a>
                </Popup>
              </Marker>
            ))}
            {buses.map(bus => {
              const lat = bus.currentLocation?.coordinates[1];
              const lng = bus.currentLocation?.coordinates[0];
              if (!lat || !lng) return null;
              return (
                <Marker key={bus._id} position={[lat, lng]} icon={busIcon}>
                  <Popup>
                    <strong>🚌 {bus.busNumber}</strong><br />
                    Route {bus.route?.routeNumber} · {bus.speed || 0} km/h
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* Search */}
      <div className="asp-search-wrap">
        <span className="asp-search-icon">🔍</span>
        <input
          className="asp-search"
          type="text"
          placeholder="Search stops by name, code, or area..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Stop list */}
      <div className="asp-stop-list">
        {loading ? (
          <div className="asp-loading">Loading stops...</div>
        ) : filteredStops.length === 0 ? (
          <div className="asp-empty">No stops found for "{search}"</div>
        ) : (
          filteredStops.map(stop => (
            <Link key={stop._id} to={`/stop/${stop._id}`} className="asp-stop-card card">
              <div className="asp-stop-left">
                <div className="asp-stop-icon-sm">🚏</div>
                <div>
                  <div className="asp-stop-name">{stop.name}</div>
                  <div className="asp-stop-meta">
                    <span className="asp-stop-code">{stop.stopCode}</span>
                    {stop.address && <span className="asp-stop-addr">{stop.address}</span>}
                  </div>
                  {stop.routes?.length > 0 && (
                    <div className="asp-route-chips">
                      {stop.routes.map(r => (
                        <span key={r._id} className="asp-route-chip">Route {r.routeNumber}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span className="asp-arrow">→</span>
            </Link>
          ))
        )}
      </div>

      <div className="asp-footer">
        <p>Tap any stop to see live bus arrivals</p>
        <p>Or scan the QR code posted at the physical stop</p>
      </div>
    </div>
  );
}
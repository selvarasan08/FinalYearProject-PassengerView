import React from 'react';
import { Link } from 'react-router-dom';
import './PassengerHeader.css';

export default function PassengerHeader() {
  return (
    <header className="p-header">
      <Link to="/" className="p-brand">
        <span className="p-brand-icon">🚌</span>
        <div>
          <span className="p-brand-name">BusTrack</span>
          <span className="p-brand-sub">Passenger</span>
        </div>
      </Link>
      <div className="live-badge">
        <span className="live-dot-wrap"><span className="live-dot"></span></span>
        Live
      </div>
    </header>
  );
}
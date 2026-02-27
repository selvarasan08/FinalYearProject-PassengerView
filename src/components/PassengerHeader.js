import React from 'react';
import { Link } from 'react-router-dom';
import './PassengerHeader.css';

export default function PassengerHeader() {
  return (
    <header className="ph-header">
      <Link to="/" className="ph-brand">
        <div className="ph-brand-icon-wrap">🚌</div>
        <div className="ph-brand-text">
          <span className="ph-brand-name">SalemOne</span>
          <span className="ph-brand-sub">Passenger</span>
        </div>
      </Link>
      <div className="ph-right">
        <div className="ph-signal">
          <span/><span/><span/><span/>
        </div>
        <div className="live-badge">
          <span className="live-dot-wrap"><span className="live-dot"/></span>
          Live
        </div>
      </div>
    </header>
  );
}
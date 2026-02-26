import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import StopPage from './Pages/StopPage';
import AllStopsPage from './Pages/AllStopsPage';
import PassengerHeader from './components/PassengerHeader';
import 'leaflet/dist/leaflet.css';
import './App.css';

export default function App() {
  return (
    <Router>
      <PassengerHeader />
      <Routes>
        {/* QR code scans land here: /stop/:stopId */}
        <Route path="/stop/:stopId" element={<StopPage />} />
        {/* Landing page showing all stops and a live map */}
        <Route path="/" element={<AllStopsPage />} />
      </Routes>
    </Router>
  );
}
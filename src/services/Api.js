import axios from 'axios';

const API = axios.create({
  baseURL: 'https://finalyearproject-backend-hpon.onrender.com/api'
});

// Public endpoints only — passengers don't need to login
export const getBusesForStop = (stopId) => API.get(`/buses/stop/${stopId}`);
export const getAllStops     = ()        => API.get('/stops');
export const getAllBuses     = ()        => API.get('/buses');
export const getStopById    = (id)      => API.get(`/stops/${id}`);
export const getAllRoutes    = ()        => API.get('/routes');

export default API;
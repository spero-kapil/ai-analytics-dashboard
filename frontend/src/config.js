const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/data';

// Background refresh interval in milliseconds; 0 disables polling.
export const REFRESH_INTERVAL_MS = toInt(import.meta.env.VITE_REFRESH_INTERVAL_MS, 60_000);

export const REQUEST_TIMEOUT_MS = 15_000;

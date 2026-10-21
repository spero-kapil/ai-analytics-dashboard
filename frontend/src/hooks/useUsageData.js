import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL, REFRESH_INTERVAL_MS, REQUEST_TIMEOUT_MS } from '../config.js';
import { normalizeUsageResponse } from '../lib/normalize.js';

const readErrorMessage = async (response) => {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || null;
  } catch {
    return null;
  }
};

const fetchUsage = async (signal) => {
  let response;
  try {
    response = await fetch(API_URL, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(`Could not reach the usage API at ${API_URL}. Check that the backend server is running.`);
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new Error(`The usage API responded with ${response.status}${detail ? `: ${detail}` : ` ${response.statusText}`}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The usage API returned a response that is not valid JSON.');
  }
  return normalizeUsageResponse(payload);
};

// Loads provider usage on mount, on demand, and on an interval. Data from the
// last successful request stays visible while a refresh is in flight or fails.
export const useUsageData = () => {
  const [state, setState] = useState({ providers: [], error: null, loading: true, refreshing: false, fetchedAt: null });
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);

    setState((prev) => ({ ...prev, refreshing: prev.fetchedAt !== null, loading: prev.fetchedAt === null }));

    try {
      const providers = await fetchUsage(controller.signal);
      setState({ providers, error: null, loading: false, refreshing: false, fetchedAt: Date.now() });
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError') return;
      const message = controller.signal.aborted
        ? `The usage API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`
        : error.message;
      setState((prev) => ({ ...prev, error: message, loading: false, refreshing: false }));
    } finally {
      clearTimeout(timeout);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (REFRESH_INTERVAL_MS <= 0) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { ...state, refresh: load };
};

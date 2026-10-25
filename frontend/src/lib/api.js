/**
 * Centralized API Client for Ledger MERN Stack.
 * Handles automatic JWT attachment, silent refresh on 401, credentials inclusion, and standardized errors.
 */

import { rateLimitMessage } from './rateLimit';

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : isLocal
      ? `${window.location.protocol}//${window.location.hostname}:5000`
      : typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:5000';

let inMemoryToken = null;

// Older builds mirrored the token into localStorage. Remove any value left
// behind so a stale bearer token does not linger after this upgrade.
if (typeof window !== 'undefined') {
  window.localStorage.removeItem('ledger:access_token');
}

// The access token deliberately lives only in memory. Persisting it in
// localStorage would let any XSS read a valid bearer token; page reloads are
// already handled by the httpOnly refresh cookie and the silent-refresh flow.
export const setAccessToken = (token) => {
  inMemoryToken = token || null;
};

export const getAccessToken = () => inMemoryToken;

export const clearAccessToken = () => {
  inMemoryToken = null;
};

let refreshPromise = null;

const silentRefreshToken = async () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // sends httpOnly refreshToken cookie
        });

        if (!res.ok) {
          clearAccessToken();
          return null;
        }

        const data = await res.json();
        if (data?.accessToken) {
          setAccessToken(data.accessToken);
          return data.accessToken;
        }
        return null;
      } catch {
        clearAccessToken();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};

export async function apiRequest(endpoint, options = {}, isRetry = false) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  // A FormData body must not be JSON-stringified, and must not carry an explicit
  // Content-Type: the browser has to generate the multipart boundary itself, and
  // a hand-written header would omit it so the server would not find the file
  // part at all. Bill attachments go up through this path.
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  const token = getAccessToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
    credentials: 'include', // essential for sameSite/httpOnly cookies
  };

  if (isMultipart) {
    config.body = options.body;
  } else if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    throw new Error(netErr.message || 'Network error: Backend server is unreachable.');
  }

  // Handle 401 with silent token refresh
  if (
    response.status === 401 &&
    !isRetry &&
    !endpoint.includes('/api/auth/login') &&
    !endpoint.includes('/api/auth/refresh')
  ) {
    const newToken = await silentRefreshToken();
    if (newToken) {
      // Retry original request with newly refreshed token
      return apiRequest(endpoint, options, true);
    }
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (
      response.status === 503 &&
      data?.code === 'MAINTENANCE_MODE' &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(new CustomEvent('ledger:maintenance'));
    }

    const errorMsg = data?.error || response.statusText || 'Request failed';
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    err.code = data?.code;

    // A rate limit or a locked account: say how long to wait, in plain words.
    if (response.status === 429 && data?.code === 'RATE_LIMITED') {
      err.retryAfterSeconds =
        Number(data.retryAfterSeconds) || Number(response.headers.get('retry-after')) || 0;
      err.message = rateLimitMessage(err.retryAfterSeconds);
    }
    throw err;
  }

  return data;
}

/**
 * Fetch an endpoint that returns a binary stream, e.g. a bill attachment.
 *
 * apiRequest would throw the body away, since it only understands JSON. This
 * hands back the Blob so the caller can trigger a download and then revoke the
 * object URL it makes from that Blob.
 */
export async function fetchFile(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  const headers = { ...(options.headers || {}) };
  const token = getAccessToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers, credentials: 'include' });

  if (!response.ok) {
    let message = response.statusText || 'Download failed';
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body; the status text is the best available message.
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return response.blob();
}

export const api = {
  get: (endpoint, options) => apiRequest(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PUT', body }),
  // Added for PATCH /api/bills/:id/status. Anything else already in the app only
  // ever used PUT, which is why this was absent.
  patch: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, body, options) => apiRequest(endpoint, { ...options, method: 'DELETE', body }),
  fetchFile,
  setToken: setAccessToken,
  getToken: getAccessToken,
  clearToken: clearAccessToken,
  API_URL,
};

export default api;

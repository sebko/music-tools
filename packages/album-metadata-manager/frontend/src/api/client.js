export const API_BASE = '/api';

// Active library id — set by LibraryContext, injected as header on all requests
let activeLibraryHeader = null;

export function setActiveLibraryHeader(libraryId) {
  activeLibraryHeader = libraryId;
}

export function getActiveLibraryHeader() {
  return activeLibraryHeader;
}

export async function apiJson(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };
  if (activeLibraryHeader) {
    headers['X-Active-Library'] = activeLibraryHeader;
  }

  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (networkErr) {
    // fetch only rejects on a network-level failure: server unreachable, offline,
    // DNS, CORS. Surface this as a clear connectivity error rather than a generic one.
    const err = new Error("Can't reach the server. Is the backend running?");
    err.isConnectivity = true;
    err.cause = networkErr;
    throw err;
  }

  if (!resp.ok) {
    let message = resp.statusText;
    let body = null;
    try {
      body = await resp.json();
      message = body?.error || body?.message || message;
    } catch {
      // Non-JSON body (e.g. the dev proxy's plain-text error when the backend is down)
    }
    const err = new Error(message || `Request failed (${resp.status})`);
    err.status = resp.status;
    err.requiresSetup = !!body?.requiresSetup;
    // The Vite dev proxy returns 502/503/504 when the backend is unreachable.
    err.isConnectivity = resp.status === 502 || resp.status === 503 || resp.status === 504;
    throw err;
  }
  return resp.json();
}


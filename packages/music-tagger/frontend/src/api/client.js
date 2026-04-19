export const API_BASE = '/api';

// Active library state — set by LibraryContext, injected as header on all requests
let activeLibraryHeader = null;

export function setActiveLibraryHeader(libraryName) {
  activeLibraryHeader = libraryName;
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
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!resp.ok) {
    let message = resp.statusText;
    try {
      const data = await resp.json();
      message = data?.error || data?.message || message;
    } catch {
      // Ignore JSON parsing errors and use the status text
    }
    throw new Error(message);
  }
  return resp.json();
}


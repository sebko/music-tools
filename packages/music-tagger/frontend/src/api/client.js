export const API_BASE = '/api';

export async function apiJson(path, options) {
  const resp = await fetch(`${API_BASE}${path}`, options);
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


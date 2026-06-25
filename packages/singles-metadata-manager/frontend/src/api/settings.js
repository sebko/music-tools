const API_BASE = '/api';

export async function fetchSettings() {
  const response = await fetch(`${API_BASE}/settings`);

  if (!response.ok) {
    throw new Error(`Failed to fetch settings: ${response.statusText}`);
  }

  return response.json();
}

export async function updateSetting(key, value) {
  const response = await fetch(`${API_BASE}/settings/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = data?.error || response.statusText;
    throw new Error(errorMessage);
  }

  return data;
}

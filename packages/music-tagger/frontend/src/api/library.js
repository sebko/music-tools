const API_BASE = '/api';

export async function startLibraryScan() {
  const response = await fetch(`${API_BASE}/library/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = data?.error || response.statusText;
    throw new Error(`Failed to start scan: ${errorMessage}`);
  }

  return data;
}

export async function stopLibraryScan() {
  const response = await fetch(`${API_BASE}/library/scan`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to stop scan: ${response.statusText}`);
  }
  
  return response.json();
}

export async function fetchScanProgress() {
  const response = await fetch(`${API_BASE}/library/scan/progress`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch scan progress: ${response.statusText}`);
  }
  
  return response.json();
}

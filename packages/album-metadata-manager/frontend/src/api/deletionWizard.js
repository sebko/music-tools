import { apiJson } from './client';

// Album Deleter endpoints take an explicit library id (independent of the
// global active library).

export async function fetchCandidates(libraryId, limit = 20) {
  return apiJson(`/deletion-wizard/candidates?${new URLSearchParams({ libraryId, limit })}`);
}

export async function recordDecision(libraryId, album, decision) {
  return apiJson('/deletion-wizard/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      libraryId,
      ratingKey: album.ratingKey,
      title: album.title,
      artist: album.artist,
      genre: album.genre,
      location: album.location,
      decision,
    }),
  });
}

export async function undoDecision(libraryId, ratingKey) {
  return apiJson(`/deletion-wizard/decisions?${new URLSearchParams({ libraryId, ratingKey })}`, {
    method: 'DELETE',
  });
}

export async function fetchMarked(libraryId) {
  return apiJson(`/deletion-wizard/marked?${new URLSearchParams({ libraryId })}`);
}

// scope: 'marked' unmarks pending/failed DELETE rows; 'all' forgets every judgment
export async function clearDecisions(libraryId, scope = 'marked') {
  return apiJson(`/deletion-wizard/decisions/all?${new URLSearchParams({ libraryId, scope })}`, {
    method: 'DELETE',
  });
}

export async function startDeletion(libraryId) {
  return apiJson('/deletion-wizard/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ libraryId }),
  });
}

export async function getDeletionProgress() {
  return apiJson('/deletion-wizard/execute/progress');
}

export async function cancelDeletion() {
  return apiJson('/deletion-wizard/execute', { method: 'DELETE' });
}

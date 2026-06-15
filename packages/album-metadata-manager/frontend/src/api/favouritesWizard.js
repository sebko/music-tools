import { apiJson } from './client';

// All favourites-wizard endpoints take explicit library ids (the wizard works on a
// source/destination pair, independent of the global active library).

function pairParams(sourceLibraryId, destinationLibraryId, extra = {}) {
  const params = new URLSearchParams({ sourceLibraryId, destinationLibraryId, ...extra });
  return params.toString();
}

export async function fetchCandidates(sourceLibraryId, destinationLibraryId, limit = 20) {
  return apiJson(
    `/favourites-wizard/candidates?${pairParams(sourceLibraryId, destinationLibraryId, { limit })}`
  );
}

export async function recordDecision(sourceLibraryId, destinationLibraryId, album, decision) {
  return apiJson('/favourites-wizard/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceLibraryId,
      destinationLibraryId,
      ratingKey: album.ratingKey,
      title: album.title,
      artist: album.artist,
      location: album.location,
      decision,
    }),
  });
}

export async function undoDecision(sourceLibraryId, destinationLibraryId, ratingKey) {
  return apiJson(
    `/favourites-wizard/decisions?${pairParams(sourceLibraryId, destinationLibraryId, { ratingKey })}`,
    { method: 'DELETE' }
  );
}

export async function fetchShortlist(sourceLibraryId, destinationLibraryId) {
  return apiJson(`/favourites-wizard/shortlist?${pairParams(sourceLibraryId, destinationLibraryId)}`);
}

export async function startCopy(sourceLibraryId, destinationLibraryId) {
  return apiJson('/favourites-wizard/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceLibraryId, destinationLibraryId }),
  });
}

export async function getCopyProgress() {
  return apiJson('/favourites-wizard/copy/progress');
}

export async function cancelCopy() {
  return apiJson('/favourites-wizard/copy', { method: 'DELETE' });
}

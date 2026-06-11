import { prisma } from "../prisma/client.js";

// Cache resolved libraries by id (short TTL) so we don't hit the DB on every request.
// Each cached entry carries the full server + account needed to open a Plex connection.
const libraryCache = new Map(); // libraryId -> { library, at }
const CACHE_TTL = 60_000; // 1 minute

const LIBRARY_INCLUDE = { server: { include: { account: true } } };

export async function loadLibrary(libraryId) {
  if (!libraryId) return null;
  const cached = libraryCache.get(libraryId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.library;

  const library = await prisma.plexLibrary.findUnique({
    where: { id: libraryId },
    include: LIBRARY_INCLUDE,
  });
  if (library) libraryCache.set(libraryId, { library, at: Date.now() });
  return library;
}

/**
 * Resolves the active library for the request and attaches:
 *   req.library         - PlexLibrary (incl. server + account) or null
 *   req.server          - the library's PlexServer (incl. account) or null
 *   req.activeLibraryId - the library id or null
 *
 * The active library is chosen from the `X-Active-Library` header (a library id),
 * falling back to AppSettings.activeLibraryId. It may be null on a fresh install
 * (no servers/libraries configured yet); endpoints that need Plex must guard for it.
 */
export async function activeLibraryMiddleware(req, res, next) {
  try {
    let libraryId = req.headers["x-active-library"]?.trim() || null;
    if (!libraryId) {
      const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
      libraryId = settings?.activeLibraryId || null;
    }
    const library = await loadLibrary(libraryId);
    req.library = library;
    req.server = library?.server || null;
    req.activeLibraryId = library?.id || null;
  } catch {
    req.library = null;
    req.server = null;
    req.activeLibraryId = null;
  }
  next();
}

/** Drop cached libraries (all, or one by id) after a server/library change. */
export function invalidateLibraryCache(libraryId = null) {
  if (libraryId) libraryCache.delete(libraryId);
  else libraryCache.clear();
}

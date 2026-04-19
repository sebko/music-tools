import { prisma } from "../prisma/client.js";

let cachedLibrary = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function activeLibraryMiddleware(req, res, next) {
  const headerLibrary = req.headers["x-active-library"];
  if (headerLibrary && headerLibrary.trim()) {
    req.activeLibrary = headerLibrary.trim();
    return next();
  }

  const now = Date.now();
  if (cachedLibrary && now < cacheExpiry) {
    req.activeLibrary = cachedLibrary;
    return next();
  }

  try {
    const settings = await prisma.plexSettings.findUnique({
      where: { id: "singleton" },
    });
    cachedLibrary = settings?.activeLibraryName || "Music";
    cacheExpiry = now + CACHE_TTL;
  } catch {
    cachedLibrary = "Music";
    cacheExpiry = now + CACHE_TTL;
  }
  req.activeLibrary = cachedLibrary;
  next();
}

export function invalidateLibraryCache() {
  cachedLibrary = null;
  cacheExpiry = 0;
}

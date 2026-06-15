/**
 * Cloudflare Worker for Redacted API Caching
 *
 * Architecture: Cache-First
 *
 * Flow:
 * 1. Check cache → HIT? Return immediately
 * 2. Cache MISS → Fetch from Redacted API → Cache → Return
 *
 * Note: Rate limiting is handled by the backend (RedactedRateLimiter)
 *
 * Cache TTLs:
 * - browse (search): 24 hours
 * - user_torrents: 1 hour
 * - torrentgroup: 7 days
 * - artist: 7 days
 */

// Cache versioning for global cache busting
// Increment this version number to invalidate all cached entries globally
// Note: Workers Cache API has no built-in global purge mechanism
// Changing this version creates new cache keys, effectively busting the cache
const CACHE_VERSION = "3";

// Cache TTL configuration (in seconds)
const CACHE_TTLS = {
  browse: 86400, // 24 hours
  user_torrents: 3600, // 1 hour
  torrentgroup: 604800, // 7 days
  artist: 604800, // 7 days
};

/**
 * Main Worker entry point
 */
export default {
  async fetch(request, env) {
    // Only handle GET requests
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Extract headers
    const apiKey = request.headers.get("Authorization");
    const domain = request.headers.get("X-Redacted-Domain");

    if (!apiKey || !domain) {
      return new Response("Missing Authorization or X-Redacted-Domain header", {
        status: 400,
      });
    }

    // Parse URL to get action
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (!action) {
      return new Response("Missing action parameter", { status: 400 });
    }

    // STEP 1: CHECK CACHE FIRST (no rate limiting on cache hits)
    const cache = caches.default;

    // Create cache key with version for global cache busting
    // When CACHE_VERSION changes, all existing cache entries are effectively invalidated
    const versionedUrl = new URL(request.url);
    versionedUrl.searchParams.set("cv", CACHE_VERSION);
    const cacheKey = new Request(versionedUrl.toString(), {
      method: request.method,
      headers: request.headers,
    });

    console.log(`🔑 Cache key: ${versionedUrl.toString()}`);

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Clone the cached response and create a new one with additional headers
      cachedResponse = new Response(cachedResponse.body, cachedResponse);

      const ttl = CACHE_TTLS[action] || 86400;

      // Create headers object with both original and new headers
      const headers = new Headers(cachedResponse.headers);
      headers.set("X-Cache-Status", "HIT");
      headers.set("X-Cache-TTL", ttl.toString());

      console.log(`📦 Cache HIT for ${action} (API key: ${apiKey.substring(0, 8)}...)`);
      console.log(`✅ Cache HIT - Bypassing rate limit check (no rate limit counter decrement)`);

      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: headers,
      });
    }

    // STEP 2: CACHE MISS - FETCH FROM REDACTED API
    console.log(`📦 Cache MISS for ${action} (API key: ${apiKey.substring(0, 8)}...)`);
    console.log(`🔍 Fetching from Redacted API (rate limiting handled by backend)`);

    // STEP 3: FETCH FROM REDACTED API

    // Build Redacted API URL
    const redactedUrl = `https://${domain}/ajax.php?${url.searchParams.toString()}`;

    console.log(`🔍 Fetching from Redacted API: ${action}`);

    const redactedResponse = await fetch(redactedUrl, {
      headers: {
        Authorization: apiKey,
        "User-Agent": "MusicTagger/2.0 via Cloudflare Worker",
      },
    });

    // Check if Redacted API returned an error
    if (!redactedResponse.ok) {
      console.error(`❌ Redacted API error: ${redactedResponse.status}`);
      // Don't cache error responses
      return new Response(redactedResponse.body, {
        status: redactedResponse.status,
        headers: {
          "Content-Type": "application/json",
          "X-Cache-Status": "MISS",
          "X-Cache-Error": "API error, not cached",
        },
      });
    }

    // STEP 4: CACHE THE SUCCESSFUL RESPONSE
    const ttl = CACHE_TTLS[action] || 86400;

    // Create headers with cache status AND Cache-Control (required for Cloudflare caching)
    const headers = new Headers(redactedResponse.headers);
    headers.set("X-Cache-Status", "MISS");
    headers.set("X-Cache-TTL", ttl.toString());
    headers.set("Cache-Control", `public, max-age=${ttl}`);

    // Create response to cache with proper Cache-Control header
    const responseToCache = new Response(redactedResponse.body, {
      status: redactedResponse.status,
      statusText: redactedResponse.statusText,
      headers: headers,
    });

    // Cache the response
    await cache.put(cacheKey, responseToCache.clone());

    console.log(`✅ Cached ${action} response (TTL: ${ttl}s)`);

    return responseToCache;
  },
};

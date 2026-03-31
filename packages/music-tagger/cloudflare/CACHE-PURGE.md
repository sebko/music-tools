# Cloudflare Cache Purge Guide

## ⚠️ Important: How Workers Cache API Works

**Cloudflare Workers Cache API has NO built-in global purge mechanism.**

Key facts:
- `npx wrangler deploy` does **NOT** clear the cache
- Cache entries persist across deployments
- Cache only expires based on TTL (time-to-live)
- Standard Cloudflare purge API does **NOT** affect Workers Cache API
- `cache.delete()` only works locally (single data center), not globally

This is a known limitation of the Cloudflare Workers Cache API platform.

---

## Cache Busting Method: Version Increment

To clear the cache globally, we use **cache versioning**:

### Step 1: Edit the Worker

```bash
cd /Users/sebastiankey/github/music-tagger/cloudflare
# Open worker.js and find CACHE_VERSION constant (near top of file)
```

### Step 2: Increment Version

Change the version number:

```javascript
// Before
const CACHE_VERSION = '1';

// After
const CACHE_VERSION = '2';
```

### Step 3: Deploy

```bash
npx wrangler deploy
```

**What this does:**
- Creates new cache keys with updated version
- Old cache entries are ignored (will expire naturally)
- All new requests fetch fresh data from Redacted API
- Takes ~30-60 seconds for global propagation

**When to use:**
- Redacted data has been updated and you need fresh data
- Suspect stale/incorrect cache data
- Testing cache behavior

---

## Cache Details

**Current TTLs:**
- Search (`browse`): 24 hours
- User torrents: 1 hour
- Album details (`torrentgroup`): **7 days**
- Artist discography: 7 days

**Cache location:** Cloudflare Cache API (global, distributed across regions)

**Cache keys:** Request URL + query params + cache version (`?cv=1`)

**Cache versioning:** Implemented as `?cv=${CACHE_VERSION}` parameter

---

## Verification

### Check if Cache Was Busted

After incrementing version and deploying, verify the cache was cleared:

1. **Backend logs** (most reliable):
   ```
   📦 Cache: MISS (TTL: 604800s)  ← Fresh fetch from Redacted API
   📦 Cache: HIT (TTL: 604800s)   ← Serving from new cache
   ```

2. **Worker logs** (if using `npx wrangler tail`):
   ```
   🔑 Cache key: https://...?action=torrentgroup&id=1964213&cv=2
   📦 Cache MISS for torrentgroup
   ✅ Cached torrentgroup response
   ```

3. **Compare data** to direct Redacted API:
   ```bash
   # Run the check-redacted.js script to see current Redacted data
   node check-redacted.js
   ```

---

## Future Improvements

For a more robust long-term solution, consider implementing:

1. **Query parameter bypass** (`?fresh=true`) - Skip cache for specific requests
2. **Cache tags** - Use Cloudflare Cache Tags for selective purging
3. **Cache purge endpoint** - Worker endpoint to trigger cache invalidation
4. **Per-album purge** - Backend API to clear specific album cache
5. **UI refresh button** - Allow users to force fresh data fetch

These would require architectural changes to the Worker and backend.

---

## Troubleshooting

**Still seeing old data after version bump and deploy?**
- Wait 60 seconds for global propagation
- Check deployment succeeded: `npx wrangler deployments list`
- Verify `CACHE_VERSION` was actually changed in deployed code
- Check backend logs show `MISS` on first request after deploy
- Verify `REDACTED_USE_CLOUDFLARE=true` in backend `.env`

**Cache key not showing version parameter?**
- Check Worker logs: `npx wrangler tail --format=pretty`
- Cache keys should include `&cv=N` where N is your version number

**Want to see what Redacted API returns right now?**
- Use the `check-redacted.js` script to bypass cache entirely
- Compare output to what your app shows

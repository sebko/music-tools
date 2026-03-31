# Cloudflare Worker for Redacted API Caching & Rate Limiting

This Worker implements best-practice "cache-first, rate-limit-second" architecture for the Redacted API integration.

## Architecture

```
Backend → Cloudflare Worker → Redacted API
              ↓
         Cache Check
         ↓         ↓
       HIT       MISS
        ↓          ↓
    Return    Rate Limit
    (instant)     ↓
              Fetch API
```

### Key Principles

1. **Cache hits bypass rate limiting** - Cached responses return immediately without counting against rate limits
2. **Single source of truth** - All rate limiting logic lives in the Worker, backend is a simple pass-through
3. **Per-API-key tracking** - Rate limits are enforced per API key, supporting multi-tenant scenarios
4. **Persistent state** - KV Store ensures rate limit state survives Worker restarts

## Setup Instructions

### 1. Install Wrangler CLI

```bash
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### 2. Create KV Namespace

```bash
cd cloudflare
wrangler kv:namespace create RATE_LIMIT_KV
```

This will output something like:
```
🌀 Creating namespace with title "redacted-cache-RATE_LIMIT_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "RATE_LIMIT_KV", id = "abc123..." }
```

### 3. Update wrangler.toml

Copy the `id` from the output above and add it to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "abc123..."  # <-- Replace with your actual ID
```

### 4. Deploy Worker

```bash
wrangler deploy
```

This will output your Worker URL, something like:
```
https://redacted-cache.YOUR-ACCOUNT.workers.dev
```

### 5. Update Backend .env

Add the Worker URL to your backend `.env`:

```bash
REDACTED_USE_CLOUDFLARE=true
CLOUDFLARE_WORKER_URL=https://redacted-cache.YOUR-ACCOUNT.workers.dev
```

### 6. Restart Backend Server

**Important:** Environment variables are loaded at process start, so you must restart the backend:

```bash
# Kill and restart servers
lsof -ti:3001 | xargs kill -9
npm run dev
```

## Configuration

### Cache TTLs (in worker.js)

```javascript
const CACHE_TTLS = {
  browse: 86400,        // 24 hours
  user_torrents: 3600,  // 1 hour
  torrentgroup: 604800, // 7 days
  artist: 604800        // 7 days
};
```

### Rate Limits (in worker.js)

```javascript
const RATE_LIMIT_REQUESTS = 10;  // requests
const RATE_LIMIT_WINDOW = 10;    // seconds
```

## Testing

Run the test suite to verify caching and rate limiting:

```bash
cd ../backend
node test-cloudflare-caching.js
```

Expected output:
- Cache MISS on first request (slower)
- Cache HIT on second request (10-45x faster)
- Rate limit headers in response

## Monitoring

### Response Headers

The Worker adds these headers for monitoring:

- `X-Cache-Status`: `HIT` or `MISS`
- `X-Cache-TTL`: Cache TTL in seconds
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when rate limit resets

### Rate Limit Response (429)

When rate limited, the Worker returns:

```json
{
  "status": "error",
  "error": "Rate limit exceeded",
  "message": "You have exceeded the rate limit of 10 requests per 10 seconds",
  "retryAfter": 3
}
```

With headers:
- `Retry-After`: Seconds to wait before retrying
- `X-RateLimit-Remaining`: `0`

## Troubleshooting

### Worker not caching

- Check Worker logs in Cloudflare dashboard
- Verify `action` parameter is being passed correctly
- Ensure Redacted API returns 200 status (errors aren't cached)

### Rate limits not working

- Verify KV namespace is bound in wrangler.toml
- Check KV namespace has correct permissions
- Look for rate limit errors in Worker logs

### Backend still rate limiting

- Verify `REDACTED_USE_CLOUDFLARE=true` in `.env`
- Restart backend server (environment variables load at startup)
- Check backend logs for rate limiter activity (should be none)

## Cost Estimate

### Cloudflare Workers (Free Tier)

- 100,000 requests/day free
- 10ms CPU time per request free

### Cloudflare KV Store (Free Tier)

- 100,000 reads/day free
- 1,000 writes/day free
- 1 GB storage free

**For typical music tagger usage (5000 albums, occasional searches):**
- Estimated cost: **$0/month** (well within free tier)
- Cache hits: ~95% (no KV operations)
- Cache misses: ~5% (2 KV operations each: read + write)

## Development

### Local Testing

Wrangler provides local development mode:

```bash
wrangler dev
```

This starts a local server at `http://localhost:8787` for testing.

Update backend `.env` temporarily:
```bash
CLOUDFLARE_WORKER_URL=http://localhost:8787
```

### Updating Worker

After making changes to `worker.js`:

```bash
wrangler deploy
```

No need to restart backend (Worker is external service).

## Files

- `worker.js` - Main Worker code with caching + rate limiting logic
- `wrangler.toml` - Wrangler configuration
- `README.md` - This file

# Quick Deployment Guide

## Prerequisites

- Cloudflare account (free tier works fine)
- Wrangler CLI installed globally: `npm install -g wrangler`

## Step 1: Login to Cloudflare

```bash
wrangler login
```

This opens your browser for authentication.

## Step 2: Create KV Namespace

```bash
cd cloudflare
wrangler kv:namespace create RATE_LIMIT_KV
```

**Output example:**
```
🌀 Creating namespace with title "redacted-cache-RATE_LIMIT_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "RATE_LIMIT_KV", id = "abc123def456..." }
```

**Copy the `id` value!**

## Step 3: Update wrangler.toml

Edit `/cloudflare/wrangler.toml` and replace the placeholder:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "abc123def456..."  # <-- Paste your actual ID here
```

## Step 4: Deploy Worker

```bash
wrangler deploy
```

**Output example:**
```
✨ Built successfully!
🌍 Deployed to https://redacted-cache.YOUR-ACCOUNT.workers.dev
```

**Copy the Worker URL!**

## Step 5: Update Backend Configuration

Edit `/backend/.env`:

```bash
# Enable Cloudflare caching + rate limiting
REDACTED_USE_CLOUDFLARE=true
CLOUDFLARE_WORKER_URL=https://redacted-cache.YOUR-ACCOUNT.workers.dev
```

## Step 6: Restart Backend

**IMPORTANT:** Environment variables load at process start!

```bash
# Kill backend
lsof -ti:3001 | xargs kill -9

# Restart from backend directory
cd ../backend
npm run dev
```

## Step 7: Verify It Works

```bash
cd ../backend
node test-cloudflare-caching.js
```

**Expected output:**
- First request: `📦 Cache: MISS` (slower, ~3000ms)
- Second request: `📦 Cache: HIT` (faster, ~68ms)
- Cache should be 10-45x faster

## Troubleshooting

### "Worker not found" error
- Verify Worker URL is correct in `.env`
- Check Worker is deployed: `wrangler deployments list`

### Rate limiting not working
- Verify KV namespace ID in `wrangler.toml`
- Check Worker logs: `wrangler tail`

### Backend still slow
- Verify `REDACTED_USE_CLOUDFLARE=true` in `.env`
- Restart backend server (kill + restart)
- Check backend logs for "Cache: HIT/MISS" messages

## Updating Worker

After making changes to `worker.js`:

```bash
wrangler deploy
```

No need to restart backend (Worker is external service).

## Monitoring

View Worker logs in real-time:

```bash
wrangler tail
```

Or check Cloudflare dashboard:
https://dash.cloudflare.com → Workers & Pages → redacted-cache → Logs

## Cost

**Free Tier Limits:**
- 100,000 requests/day
- 10ms CPU time/request
- 100,000 KV reads/day
- 1,000 KV writes/day

**For typical usage:** $0/month (well within free tier)

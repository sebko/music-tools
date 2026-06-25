/**
 * Rate limiter for Redacted API to ensure compliance with their limits:
 * "Refrain from making more than ten (10) requests every ten (10) seconds"
 *
 * Implements per-API-key rate limiting with sliding window and request queuing.
 */
export class RedactedRateLimiter {
  constructor() {
    // Store request timestamps per API key
    this.requestHistory = new Map(); // apiKey -> Array of timestamps

    // Store pending request queues per API key
    this.requestQueues = new Map(); // apiKey -> Array of {requestFn, resolve, reject}

    // Track if processing is active per API key
    this.processingQueues = new Set(); // Set of apiKeys currently processing

    // Configuration (can be overridden via env vars)
    this.maxRequests = parseInt(process.env.REDACTED_RATE_LIMIT_REQUESTS) || 10;
    this.windowMs = parseInt(process.env.REDACTED_RATE_LIMIT_WINDOW) || 10000; // 10 seconds
    this.minDelayMs = parseInt(process.env.REDACTED_MIN_REQUEST_DELAY) || 1200; // 1.2 seconds

    // Cleanup old data every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Execute a request with rate limiting
   * @param {string} apiKey - The API key to rate limit per user
   * @param {Function} requestFn - Async function that performs the actual request
   * @returns {Promise} Promise that resolves with the request result
   */
  async executeRequest(apiKey, requestFn) {
    // When Cloudflare caching is enabled, use proactive rate limiting
    // Only count cache misses (actual API hits) against the rate limit
    const useCloudflare = process.env.REDACTED_USE_CLOUDFLARE === "true";

    if (useCloudflare) {
      // Proactive: Check rate limit BEFORE making request
      await this.waitForRateLimit(apiKey);

      // CRITICAL: Record request BEFORE making it (reservation pattern)
      // This prevents race conditions where multiple sequential albums
      // check the rate limit before any of them record their requests
      const timestamp = this.recordRequest(apiKey);
      console.log(`🔒 Reserved rate limit slot (${apiKey.substring(0, 8)}...)`);

      let response;
      try {
        // Execute request through Cloudflare Worker
        response = await requestFn();
      } catch (error) {
        // Request failed - remove the reservation
        this.removeRequest(apiKey, timestamp);
        console.log(`❌ Request failed, removed reservation (${apiKey.substring(0, 8)}...)`);
        throw error;
      }

      // Check if this was a cache miss (hit Redacted API)
      const cacheStatus = response?.headers?.get?.('X-Cache-Status');

      if (cacheStatus === 'MISS') {
        // Cache miss - keep the reservation (counts against rate limit)
        console.log(`📦 Cache MISS - Request counted against rate limit (${apiKey.substring(0, 8)}...)`);
      } else if (cacheStatus === 'HIT') {
        // Cache hit - free! Remove the reservation
        this.removeRequest(apiKey, timestamp);
        console.log(`📦 Cache HIT - Removed reservation (free request!) (${apiKey.substring(0, 8)}...)`);
      } else {
        // No cache status header - keep reservation to be safe
        console.log(`📦 No cache status - Kept reservation for safety (${apiKey.substring(0, 8)}...)`);
      }

      return response;
    }

    // No caching - use rate limiting with queueing
    return new Promise((resolve, reject) => {
      // Add request to queue
      if (!this.requestQueues.has(apiKey)) {
        this.requestQueues.set(apiKey, []);
      }

      this.requestQueues.get(apiKey).push({
        requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Start processing if not already running for this API key
      this.processQueue(apiKey);
    });
  }

  /**
   * Process the request queue for a specific API key
   * @param {string} apiKey - The API key to process queue for
   */
  async processQueue(apiKey) {
    // Prevent multiple concurrent processing for same API key
    if (this.processingQueues.has(apiKey)) {
      return;
    }

    this.processingQueues.add(apiKey);

    try {
      const queue = this.requestQueues.get(apiKey) || [];

      while (queue.length > 0) {
        const queueItem = queue.shift();
        const { requestFn, resolve, reject } = queueItem;

        try {
          // Wait if necessary to respect rate limits
          await this.waitForRateLimit(apiKey);

          // Record the request timestamp
          this.recordRequest(apiKey);

          // Execute the request
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }

        // Add minimum delay between requests (even if under rate limit)
        if (queue.length > 0) {
          await this.sleep(this.minDelayMs);
        }
      }
    } finally {
      this.processingQueues.delete(apiKey);
    }
  }

  /**
   * Wait until it's safe to make a request without exceeding rate limits
   * @param {string} apiKey - The API key to check rate limits for
   */
  async waitForRateLimit(apiKey) {
    const now = Date.now();
    const history = this.getRequestHistory(apiKey);

    // Remove old requests outside the time window
    const cutoff = now - this.windowMs;
    const recentRequests = history.filter(timestamp => timestamp > cutoff);

    // Update the history with only recent requests
    this.requestHistory.set(apiKey, recentRequests);

    // If we're under the limit, no need to wait
    if (recentRequests.length < this.maxRequests) {
      return;
    }

    // Find the oldest request in the current window
    const oldestRequest = Math.min(...recentRequests);

    // Calculate how long to wait until that request falls outside the window
    const waitTime = oldestRequest + this.windowMs - now;

    if (waitTime > 0) {
      console.log(
        `Redacted rate limit: waiting ${waitTime}ms for API key ${apiKey.substring(0, 8)}...`
      );
      await this.sleep(waitTime);
    }
  }

  /**
   * Record a request timestamp for an API key
   * @param {string} apiKey - The API key to record request for
   * @returns {number} The timestamp recorded
   */
  recordRequest(apiKey) {
    const history = this.getRequestHistory(apiKey);
    const now = Date.now();
    history.push(now);
    return now;
  }

  /**
   * Remove a specific request timestamp for an API key
   * Used when a request fails or turns out to be a cache hit
   * @param {string} apiKey - The API key to remove request for
   * @param {number} timestamp - The specific timestamp to remove
   */
  removeRequest(apiKey, timestamp) {
    const history = this.getRequestHistory(apiKey);
    const index = history.indexOf(timestamp);
    if (index !== -1) {
      history.splice(index, 1);
    }
  }

  /**
   * Get request history for an API key
   * @param {string} apiKey - The API key to get history for
   * @returns {Array} Array of timestamps
   */
  getRequestHistory(apiKey) {
    if (!this.requestHistory.has(apiKey)) {
      this.requestHistory.set(apiKey, []);
    }
    return this.requestHistory.get(apiKey);
  }

  /**
   * Sleep for a specified number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up old data to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs * 2; // Keep double the window for safety

    // Clean up request history
    for (const [apiKey, history] of this.requestHistory.entries()) {
      const recentHistory = history.filter(timestamp => timestamp > cutoff);
      if (recentHistory.length === 0) {
        this.requestHistory.delete(apiKey);
      } else {
        this.requestHistory.set(apiKey, recentHistory);
      }
    }

    // Clean up empty queues
    for (const [apiKey, queue] of this.requestQueues.entries()) {
      if (queue.length === 0) {
        this.requestQueues.delete(apiKey);
      }
    }

    console.log(`Redacted rate limiter cleanup: tracking ${this.requestHistory.size} API keys`);
  }

  /**
   * Get current status for debugging
   * @param {string} apiKey - Optional API key to get specific status
   * @returns {Object} Status information
   */
  getStatus(apiKey = null) {
    if (apiKey) {
      const history = this.getRequestHistory(apiKey);
      const queue = this.requestQueues.get(apiKey) || [];
      const now = Date.now();
      const recentRequests = history.filter(timestamp => timestamp > now - this.windowMs);

      return {
        apiKey: apiKey.substring(0, 8) + "...",
        recentRequests: recentRequests.length,
        maxRequests: this.maxRequests,
        queueLength: queue.length,
        isProcessing: this.processingQueues.has(apiKey),
      };
    }

    return {
      totalApiKeys: this.requestHistory.size,
      totalQueues: this.requestQueues.size,
      processingQueues: this.processingQueues.size,
      config: {
        maxRequests: this.maxRequests,
        windowMs: this.windowMs,
        minDelayMs: this.minDelayMs,
      },
    };
  }

  /**
   * Cleanup when shutting down
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Create singleton instance
export const redactedLimiter = new RedactedRateLimiter();

// Cleanup on process exit
process.on("exit", () => {
  redactedLimiter.destroy();
});

/**
 * External API Mocks
 *
 * This file contains mocks for third-party APIs only.
 * Our own backend endpoints should NOT be mocked for true E2E testing.
 *
 * Mocked APIs:
 * - Spotify Web API
 * - MusicBrainz API
 * - Discogs API
 * - Cover Art Archive
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ExternalApiMocks {
  constructor() {
    this.fixturesPath = join(__dirname, '../fixtures/metadata-responses');
  }

  loadFixture(filename) {
    try {
      return JSON.parse(
        readFileSync(join(this.fixturesPath, filename), 'utf-8')
      );
    } catch (error) {
      console.warn(`⚠️ Could not load fixture ${filename}:`, error.message);
      return null;
    }
  }

  async setupExternalMocks(page) {
    console.log('🎭 Setting up external API mocks...');

    // Load mock data if fixtures exist
    const spotifyMock = this.loadFixture('spotify.json');
    const musicbrainzMock = this.loadFixture('musicbrainz.json');
    const discogsMock = this.loadFixture('discogs.json');

    // Mock Spotify API calls
    if (spotifyMock) {
      await page.route('**/api.spotify.com/**', async route => {
        const url = route.request().url();
        console.log(`🎵 Mocking Spotify API: ${url}`);

        if (url.includes('/search')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(spotifyMock.albums || {})
          });
        } else if (url.includes('/albums/')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(spotifyMock.tracks || {})
          });
        } else {
          await route.continue();
        }
      });
    }

    // Mock MusicBrainz API calls
    if (musicbrainzMock) {
      await page.route('**/musicbrainz.org/ws/**', async route => {
        const url = route.request().url();
        console.log(`🎼 Mocking MusicBrainz API: ${url}`);

        if (url.includes('/release')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(musicbrainzMock)
          });
        } else {
          await route.continue();
        }
      });

      // Mock Cover Art Archive (MusicBrainz artwork)
      await page.route('**/coverartarchive.org/**', async route => {
        console.log(`🖼️ Mocking Cover Art Archive: ${route.request().url()}`);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(musicbrainzMock.coverart || {})
        });
      });
    }

    // Mock Discogs API calls
    if (discogsMock) {
      await page.route('**/api.discogs.com/**', async route => {
        const url = route.request().url();
        console.log(`💿 Mocking Discogs API: ${url}`);

        if (url.includes('/database/search')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(discogsMock)
          });
        } else {
          await route.continue();
        }
      });
    }

    console.log('✅ External API mocks configured');
  }

  // Utility methods for simulating API errors
  async mockNetworkError(page, apiPattern) {
    await page.route(apiPattern, async route => {
      console.log(`❌ Simulating network error for: ${route.request().url()}`);
      await route.abort('failed');
    });
  }

  async mockRateLimitError(page, apiPattern) {
    await page.route(apiPattern, async route => {
      console.log(`🚫 Simulating rate limit error for: ${route.request().url()}`);
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Rate limit exceeded',
          message: 'Too many requests'
        })
      });
    });
  }

  async mockSlowResponse(page, apiPattern, delayMs = 5000) {
    await page.route(apiPattern, async route => {
      console.log(`⏱️ Simulating slow response for: ${route.request().url()}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await route.continue();
    });
  }
}

export const externalApiMocks = new ExternalApiMocks();
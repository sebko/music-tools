import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ApiMocks {
  constructor() {
    this.fixturesPath = join(__dirname, '../fixtures/metadata-responses');
  }

  loadFixture(filename) {
    return JSON.parse(
      readFileSync(join(this.fixturesPath, filename), 'utf-8')
    );
  }

  async setupMocks(page) {
    console.log('🎭 Setting up API mocks...');

    // Load mock data
    const spotifyMock = this.loadFixture('spotify.json');
    const musicbrainzMock = this.loadFixture('musicbrainz.json');
    const discogsMock = this.loadFixture('discogs.json');

    // Mock Spotify API calls
    await page.route('**/api.spotify.com/**', async route => {
      const url = route.request().url();
      console.log(`🎵 Mocking Spotify API: ${url}`);

      if (url.includes('/search')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(spotifyMock.albums)
        });
      } else if (url.includes('/albums/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(spotifyMock.tracks)
        });
      } else {
        await route.continue();
      }
    });

    // Mock MusicBrainz API calls
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
        body: JSON.stringify(musicbrainzMock.coverart)
      });
    });

    // Mock Discogs API calls
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

    // Mock file system access (for library scanning)
    await page.route('**/api/library/scan', async route => {
      const method = route.request().method();
      console.log(`📁 Mocking library scan: ${method}`);

      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Library scan started',
            scanId: 'test-scan-1'
          })
        });
      } else if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            isScanning: false,
            progress: 100,
            currentFile: '',
            totalFiles: 100,
            processedFiles: 100,
            errors: []
          })
        });
      } else {
        await route.continue();
      }
    });

    console.log('✅ API mocks configured');
  }

  async mockNetworkError(page, apiPattern) {
    await page.route(apiPattern, async route => {
      console.log(`❌ Simulating network error for: ${route.request().url()}`);
      await route.abort('failed');
    });
  }

  async mockSlowResponse(page, apiPattern, delayMs = 5000) {
    await page.route(apiPattern, async route => {
      console.log(`⏱️ Simulating slow response for: ${route.request().url()}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await route.continue();
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
}

export const apiMocks = new ApiMocks();
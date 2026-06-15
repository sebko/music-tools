import { test as base, expect } from '@playwright/test';
import { testDb } from './database-setup.js';
import { apiMocks } from './api-mocks.js';

// Custom fixtures for album-metadata-manager E2E tests
export const test = base.extend({
  // Database fixture - provides test data access
  testDatabase: async (_, useTester) => {
    console.log('🗄️ Setting up test database fixture...');
    const db = await testDb.setupTestDatabase();
    await useTester(db);
    await testDb.cleanupTestDatabase();
  },

  // API mocks fixture - sets up external API mocking
  mockedApis: async ({ page }, useTester) => {
    console.log('🎭 Setting up API mocks fixture...');
    await apiMocks.setupMocks(page);
    await useTester(apiMocks);
  },

  // Album browsing fixture - sets up page for album testing
  albumBrowsingPage: async ({ page, mockedApis: _mockedApis, testDatabase }, useTester) => {
    console.log('📚 Setting up album browsing fixture...');

    // Navigate to albums page
    await page.goto('/albums');

    // Wait for albums to load
    await page.waitForSelector('[data-testid="albums-grid"], .albums-grid', { timeout: 10000 });

    const fixture = {
      page,
      testAlbums: testDatabase.albums,
      async navigateToAlbum(albumIndex = 0) {
        const album = testDatabase.albums[albumIndex];
        await page.click(`[data-testid="album-${album.id}"], img[alt*="${album.title}"]`);
        await page.waitForSelector('h1', { timeout: 10000 });
        return album;
      },
      async waitForAlbumsToLoad() {
        await page.waitForSelector('[data-testid="albums-grid"], .albums-grid');
        await page.waitForLoadState('networkidle');
      }
    };

    await useTester(fixture);
  },

  // Metadata lookup fixture - sets up page for metadata testing
  metadataLookupPage: async ({ page, mockedApis: _mockedApis, albumBrowsingPage }, useTester) => {
    console.log('🔍 Setting up metadata lookup fixture...');

    // Navigate to a test album's metadata page
    const testAlbum = await albumBrowsingPage.navigateToAlbum(0);

    // Look for metadata lookup button/link
    const metadataButton = page.locator('text=View Metadata Lookup, text=Metadata, a[href*="/metadata"]').first();
    if (await metadataButton.count() > 0) {
      await metadataButton.click();
    } else {
      // Fallback: navigate directly to metadata page
      await page.goto(`/albums/${testAlbum.id}/metadata`);
    }

    // Wait for metadata page to load
    await page.waitForSelector('h1:has-text("Metadata"), h1:has-text("Lookup")', { timeout: 10000 });

    const fixture = {
      page,
      testAlbum,
      async waitForMetadataResults() {
        await page.waitForSelector('text=Spotify, text=MusicBrainz, text=Discogs', { timeout: 15000 });
      },
      async selectMetadataSource(source) {
        await page.click(`input[type="radio"][value="${source}"]`);
      },
      async applyMetadata() {
        await page.click('button:has-text("Apply Metadata"), button:has-text("Apply")');
      }
    };

    await useTester(fixture);
  },

  // Library scanning fixture - sets up page for library management testing
  libraryScanPage: async ({ page, mockedApis: _mockedApis }, useTester) => {
    console.log('📁 Setting up library scan fixture...');

    await page.goto('/library');

    const fixture = {
      page,
      async startLibraryScan() {
        await page.click('button:has-text("Scan Library"), button:has-text("Start Scan")');
      },
      async waitForScanProgress() {
        await page.waitForSelector('[data-testid="scan-progress"], .scan-progress');
      },
      async waitForScanComplete() {
        await page.waitForSelector('text=Scan completed, text=100%', { timeout: 30000 });
      }
    };

    await useTester(fixture);
  },

  // Visual testing fixture - for consistent screenshot testing
  visualTesting: async ({ page }, useTester) => {
    console.log('📸 Setting up visual testing fixture...');

    // Set consistent viewport for visual tests
    await page.setViewportSize({ width: 1280, height: 720 });

    const fixture = {
      page,
      async takeScreenshot(name, options = {}) {
        return await page.screenshot({
          path: `e2e/reports/screenshots/${name}.png`,
          fullPage: false,
          ...options
        });
      },
      async compareScreenshot(name) {
        await page.screenshot({
          path: `e2e/reports/screenshots/${name}-actual.png`,
          fullPage: false
        });
        // In a real implementation, this would compare against a baseline
        console.log(`📸 Screenshot captured: ${name}`);
      }
    };

    await useTester(fixture);
  }
});

export { expect };
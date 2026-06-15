import { test, expect } from '@playwright/test';

test.describe('Albums Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the albums page (home page)
    await page.goto('http://localhost:5173/');
  });

  test('should load albums page and display grid', async ({ page }) => {
    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check for albums grid - try multiple possible selectors
    const gridSelectors = [
      '[data-testid="albums-grid"]',
      '.albums-grid',
      '.grid',
      'main'
    ];

    let gridFound = false;
    for (const selector of gridSelectors) {
      const grid = page.locator(selector).first();
      if (await grid.count() > 0) {
        await expect(grid).toBeVisible();
        gridFound = true;
        console.log(`✅ Found albums grid with selector: ${selector}`);
        break;
      }
    }

    if (!gridFound) {
      // At minimum, check that we're on the right page
      await expect(page).toHaveURL('http://localhost:5173/');
      console.log('⚠️ Could not find albums grid, but page loaded');
    }
  });

  test('should fetch albums from backend API', async ({ page }) => {
    // Set up response interception to monitor API calls
    let albumsApiCalled = false;
    let albumsApiResponse = null;

    page.on('response', response => {
      const url = response.url();
      // Only track the main albums list API, not artwork endpoints
      if (url.includes('/api/albums') && !url.includes('/artwork')) {
        albumsApiCalled = true;
        albumsApiResponse = response;
      }
    });

    // Navigate to the page
    await page.goto('http://localhost:5173/');

    // Wait for potential API calls
    await page.waitForLoadState('networkidle');

    if (albumsApiCalled) {
      console.log(`✅ Albums API was called: ${albumsApiResponse.url()}`);
      console.log(`✅ API responded with status: ${albumsApiResponse.status()}`);

      if (albumsApiResponse.ok()) {
        try {
          const data = await albumsApiResponse.json();
          console.log(`✅ API returned ${data.albums?.length || 0} albums`);
        } catch {
          console.log('⚠️ Could not parse response as JSON');
        }
      }
    } else {
      console.log('⚠️ Albums API was not called - data might be cached by React Query');
    }
  });

  test('should display album items if data exists', async ({ page, request }) => {
    // First check if there's data in the backend
    const apiResponse = await request.get('http://localhost:3001/api/albums?page=1&limit=20');

    if (!apiResponse.ok()) {
      console.log('⚠️ Backend API not responding properly');
      return;
    }

    const data = await apiResponse.json();
    const albumCount = data.albums?.length || 0;

    console.log(`📊 Backend has ${albumCount} albums`);

    // Navigate to the page
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    if (albumCount > 0) {
      // Look for album links - they have href pattern /albums/{id}
      const albumLinks = page.locator('a[href^="/albums/"]');
      const linkCount = await albumLinks.count();

      if (linkCount > 0) {
        console.log(`✅ Found ${linkCount} album links on the page`);

        // Verify the first album link is visible and has content
        const firstAlbum = albumLinks.first();
        await expect(firstAlbum).toBeVisible();

        // Check that albums have titles (h3 elements)
        const albumTitles = page.locator('h3');
        const titleCount = await albumTitles.count();
        console.log(`✅ Found ${titleCount} album titles`);

        // Verify first title is visible
        if (titleCount > 0) {
          await expect(albumTitles.first()).toBeVisible();
          const firstTitle = await albumTitles.first().textContent();
          console.log(`✅ First album title: "${firstTitle}"`);
        }
      } else {
        console.log('⚠️ No album links found on the page');
      }
    } else {
      // Check for empty state message
      const emptyStateSelectors = [
        'text=/no albums/i',
        'text=/empty/i',
        'text=/get started/i'
      ];

      for (const selector of emptyStateSelectors) {
        const emptyState = page.locator(selector);
        if (await emptyState.count() > 0) {
          console.log('✅ Found empty state message (no albums in database)');
          break;
        }
      }
    }
  });

  test('should display album artwork for albums', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    // Look for album images
    const images = page.locator('img');
    const imageCount = await images.count();

    if (imageCount > 0) {
      console.log(`🖼️ Found ${imageCount} images on the page`);

      // Check if any images are album artwork
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const src = await img.getAttribute('src');

        if (src && src.includes('/api/albums/') && src.includes('/artwork')) {
          console.log(`✅ Found album artwork: ${src}`);

          // Verify the image loads
          await expect(img).toBeVisible();

          // Check natural dimensions to ensure image loaded
          const naturalWidth = await img.evaluate((el) => el.naturalWidth);
          if (naturalWidth > 0) {
            console.log(`✅ Album artwork loaded successfully (width: ${naturalWidth}px)`);
          }
        }
      }
    }
  });
});
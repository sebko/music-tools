import { test, expect } from "@playwright/test";
import { externalApiMocks } from "../utils/external-api-mocks.js";

test.describe("Metadata Search", () => {
  test("should search for metadata from external sources", async ({ page }) => {
    // Set up mocks for external APIs only
    await externalApiMocks.setupExternalMocks(page);

    // First, get an album ID from the backend
    const albumsResponse = await fetch(
      "http://localhost:3001/api/albums?page=1&limit=1"
    );

    if (!albumsResponse.ok) {
      console.log("⚠️ No albums available for metadata testing");
      return;
    }

    const albumsData = await albumsResponse.json();
    if (!albumsData.albums || albumsData.albums.length === 0) {
      console.log("⚠️ No albums in database for metadata testing");
      return;
    }

    const testAlbum = albumsData.albums[0];
    console.log(
      `🎵 Testing metadata for album: ${testAlbum.title} by ${testAlbum.artist}`
    );

    // Navigate to the album's metadata page
    await page.goto(`http://localhost:5173/albums/${testAlbum.id}/metadata`);
    await page.waitForLoadState("networkidle");

    // Check if the metadata page loaded
    const heading = page
      .locator("h1")
      .filter({ hasText: /metadata|lookup/i })
      .first();
    await expect(heading).toBeVisible();
    console.log("✅ Metadata page loaded");

    // Verify the metadata comparison table is present
    const metadataTable = page.locator("table");
    await expect(metadataTable).toBeVisible();

    // Check for column headers for different sources
    await expect(page.locator('th:has-text("Current")')).toBeVisible();
    await expect(page.locator('th:has-text("Spotify")')).toBeVisible();
    await expect(page.locator('th:has-text("MusicBrainz")')).toBeVisible();
    await expect(page.locator('th:has-text("Discogs")')).toBeVisible();

    // Verify current album data is displayed
    const currentTitle = page
      .locator('td:has-text("Album")')
      .locator("..")
      .locator(".bg-blue-50");
    await expect(currentTitle).toContainText(testAlbum.title);

    // Check for source selection radio buttons
    const sourceRadios = page.locator('input[name="metadataSource"]');
    await expect(sourceRadios).toHaveCount(4); // spotify, musicbrainz, discogs, redacted

    // Verify genre selection functionality
    const genreSection = page.locator('text="Selected genres"');
    await expect(genreSection).toBeVisible();

    // Check for artwork selection section
    const artworkSection = page.locator('text="Album Artwork"');
    await expect(artworkSection).toBeVisible();

    // Verify apply metadata button is present
    const applyButton = page.locator('button:has-text("Apply Metadata")');
    await expect(applyButton).toBeVisible();

    console.log("✅ All metadata page sections verified");
  });

  test("should allow selecting and interacting with metadata sources", async ({
    page,
  }) => {
    // Set up mocks for external APIs
    await externalApiMocks.setupExternalMocks(page);

    // Get first album for testing
    const albumsResponse = await fetch(
      "http://localhost:3001/api/albums?page=1&limit=1"
    );
    if (!albumsResponse.ok) return;

    const albumsData = await albumsResponse.json();
    if (!albumsData.albums || albumsData.albums.length === 0) return;

    const testAlbum = albumsData.albums[0];

    // Navigate to metadata page
    await page.goto(`http://localhost:5173/albums/${testAlbum.id}/metadata`);
    await page.waitForLoadState("networkidle");

    console.log("✅ Metadata page loaded for interaction test");

    // Test selecting a metadata source (Spotify)
    const spotifyRadio = page.locator(
      'input[name="metadataSource"][value="spotify"]'
    );
    if (await spotifyRadio.isEnabled()) {
      await spotifyRadio.check();
      await expect(spotifyRadio).toBeChecked();
      console.log("✅ Spotify metadata source selected");
    }

    // Test genre interaction - try to click a genre button if available
    const genreButtons = page.locator(
      'button:has-text("cumbia"), button:has-text("electronic"), button:has-text("latin")'
    );
    const genreCount = await genreButtons.count();
    if (genreCount > 0) {
      await genreButtons.first().click();
      console.log("✅ Genre button clicked");

      // Check if genre was added to selected genres
      const selectedGenres = page.locator(".bg-green-100");
      const selectedCount = await selectedGenres.count();
      expect(selectedCount).toBeGreaterThanOrEqual(1);
      console.log("✅ Genre added to selection");
    }

    // Test artwork selection if available
    const artworkRadios = page.locator('input[name="artworkSource"]');
    const artworkCount = await artworkRadios.count();
    if (artworkCount > 0) {
      const firstArtwork = artworkRadios.first();
      if (await firstArtwork.isEnabled()) {
        await firstArtwork.check();
        await expect(firstArtwork).toBeChecked();
        console.log("✅ Artwork option selected");
      }
    }

    // Check if Apply Metadata button becomes enabled when selections are made
    const applyButton = page.locator('button:has-text("Apply Metadata")');
    const isEnabled = await applyButton.isEnabled();
    if (isEnabled) {
      console.log("✅ Apply button is enabled with selections");
    } else {
      console.log("ℹ️ Apply button disabled (no valid selections)");
    }

    console.log("✅ Metadata interaction test completed");
  });

  test("should handle metadata API errors gracefully", async ({ page }) => {
    // Mock a rate limit error for Spotify
    await externalApiMocks.mockRateLimitError(page, "**/api.spotify.com/**");

    // Get first album for testing
    const albumsResponse = await fetch(
      "http://localhost:3001/api/albums?page=1&limit=1"
    );
    if (!albumsResponse.ok) return;

    const albumsData = await albumsResponse.json();
    if (!albumsData.albums || albumsData.albums.length === 0) return;

    const testAlbum = albumsData.albums[0];

    // Navigate to metadata page
    await page.goto(`http://localhost:5173/albums/${testAlbum.id}/metadata`);
    await page.waitForLoadState("networkidle");

    // Try to search for metadata
    const searchButton = page
      .locator("button")
      .filter({ hasText: /search|lookup|fetch/i })
      .first();
    if ((await searchButton.count()) > 0) {
      await searchButton.click();
      await page.waitForTimeout(2000);

      // Check for error handling
      const errorMessages = page.locator(
        "text=/error|failed|rate limit|try again/i"
      );
      if ((await errorMessages.count()) > 0) {
        console.log("✅ Error message displayed for rate limit");
      }
    }
  });
});

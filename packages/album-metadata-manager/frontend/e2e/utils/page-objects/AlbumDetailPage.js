export class AlbumDetailPage {
  constructor(page) {
    this.page = page;

    // Selectors
    this.albumTitle = 'h1, [data-testid="album-title"]';
    this.albumArtist = '[data-testid="album-artist"], .album-artist';
    this.albumArtwork = 'img[alt*="album"], img[src*="/albums/"], [data-testid="album-artwork"]';
    this.albumYear = '[data-testid="album-year"], .album-year';
    this.albumGenre = '[data-testid="album-genre"], .album-genre';
    this.albumDirectory = '[data-testid="album-directory"], .album-directory';
    this.trackCount = '[data-testid="track-count"], .track-count';
    this.tracksList = '[data-testid="tracks-list"], .tracks-list, ul';
    this.trackItem = '[data-testid^="track-"], .track-item, li';
    this.metadataButton = 'button:has-text("View Metadata"), a:has-text("Metadata"), [data-testid="metadata-button"]';
    this.refreshButton = 'button:has-text("Refresh"), [data-testid="refresh-album"]';
    this.backButton = 'button:has-text("Back"), a:has-text("Back"), [data-testid="back-button"]';
    this.editButton = 'button:has-text("Edit"), [data-testid="edit-album"]';
  }

  async waitForLoad() {
    await this.page.waitForSelector(this.albumTitle, { timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }

  async getAlbumInfo() {
    await this.waitForLoad();

    return {
      title: await this.page.locator(this.albumTitle).textContent(),
      artist: await this.page.locator(this.albumArtist).textContent(),
      year: await this.getMetadataValue('Year'),
      genre: await this.getMetadataValue('Genre'),
      directory: await this.getMetadataValue('Directory'),
      trackCount: await this.getMetadataValue('Tracks')
    };
  }

  async getMetadataValue(label) {
    try {
      // Look for metadata in various possible formats
      const patterns = [
        `text=${label}:`, // "Year: 2023"
        `text=${label}`, // Just the label
        `[data-testid="${label.toLowerCase()}"]`, // data-testid
        `.${label.toLowerCase()}` // CSS class
      ];

      for (const pattern of patterns) {
        const element = this.page.locator(pattern);
        if (await element.count() > 0) {
          const text = await element.textContent();
          // Extract value after colon if present
          return text.includes(':') ? text.split(':')[1].trim() : text.trim();
        }
      }

      return null;
    } catch (error) {
      console.log(`Could not find metadata for ${label}:`, error.message);
      return null;
    }
  }

  async hasArtwork() {
    return await this.page.locator(this.albumArtwork).count() > 0;
  }

  async getArtworkSrc() {
    if (await this.hasArtwork()) {
      return await this.page.locator(this.albumArtwork).getAttribute('src');
    }
    return null;
  }

  async verifyArtworkLoads() {
    const src = await this.getArtworkSrc();
    if (!src) return false;

    const response = await this.page.request.get(src);
    return response.ok();
  }

  async getTracks() {
    const tracks = [];
    const trackElements = this.page.locator(this.trackItem);
    const count = await trackElements.count();

    for (let i = 0; i < count; i++) {
      const element = trackElements.nth(i);
      const text = await element.textContent();

      // Parse track info (assuming format like "1. Track Name - 3:45")
      const match = text.match(/(\\d+)\\.\\s*(.+?)(?:\\s*-\\s*([\\d:]+))?$/);
      if (match) {
        tracks.push({
          number: parseInt(match[1]),
          title: match[2].trim(),
          duration: match[3] || null
        });
      } else {
        tracks.push({
          number: i + 1,
          title: text.trim(),
          duration: null
        });
      }
    }

    return tracks;
  }

  async goToMetadataPage() {
    await this.page.click(this.metadataButton);
    await this.page.waitForURL('**/metadata**');
    await this.page.waitForSelector('h1:has-text("Metadata"), h1:has-text("Lookup")');
  }

  async refreshAlbum() {
    await this.page.click(this.refreshButton);
    await this.waitForLoad();
  }

  async goBack() {
    await this.page.click(this.backButton);
  }

  async editAlbum() {
    await this.page.click(this.editButton);
  }

  async verifyAlbumMetadata(expectedData) {
    const albumInfo = await this.getAlbumInfo();
    const verificationResults = {};

    for (const [key, expectedValue] of Object.entries(expectedData)) {
      const actualValue = albumInfo[key];
      verificationResults[key] = {
        expected: expectedValue,
        actual: actualValue,
        matches: actualValue === expectedValue
      };
    }

    return verificationResults;
  }

  async waitForArtworkUpdate(timeoutMs = 5000) {
    const initialSrc = await this.getArtworkSrc();

    try {
      await this.page.waitForFunction(
        (initial) => {
          const currentImg = document.querySelector('img[alt*="album"], img[src*="/albums/"]');
          return currentImg && currentImg.src !== initial;
        },
        initialSrc,
        { timeout: timeoutMs }
      );
      return true;
    } catch {
      return false;
    }
  }
}
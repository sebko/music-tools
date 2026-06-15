export class AlbumsPage {
  constructor(page) {
    this.page = page;

    // Selectors
    this.albumsGrid = '[data-testid="albums-grid"], .albums-grid, [class*="grid"]';
    this.albumCard = '[data-testid^="album-"], .album-card, [class*="album"]';
    this.albumImage = 'img[alt*="album"], img[src*="/albums/"]';
    this.albumTitle = '[data-testid="album-title"], .album-title, h3';
    this.albumArtist = '[data-testid="album-artist"], .album-artist';
    this.loadMoreButton = 'button:has-text("Load More"), [data-testid="load-more"]';
    this.searchInput = 'input[placeholder*="search"], [data-testid="search"]';
    this.filterDropdown = 'select[data-testid="filter"], .filter-dropdown';
    this.sortDropdown = 'select[data-testid="sort"], .sort-dropdown';
    this.scanLibraryButton = 'button:has-text("Scan Library"), [data-testid="scan-library"]';
  }

  async goto() {
    await this.page.goto('/albums');
    await this.waitForLoad();
  }

  async waitForLoad() {
    await this.page.waitForSelector(this.albumsGrid, { timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }

  async getAlbumCount() {
    return await this.page.locator(this.albumCard).count();
  }

  async getAlbumByIndex(index) {
    const albumElement = this.page.locator(this.albumCard).nth(index);

    return {
      element: albumElement,
      title: await albumElement.locator(this.albumTitle).textContent(),
      artist: await albumElement.locator(this.albumArtist).textContent(),
      async click() {
        await albumElement.click();
      }
    };
  }

  async getAlbumByTitle(title) {
    const albumElement = this.page.locator(this.albumCard).filter({ hasText: title });

    if (await albumElement.count() === 0) {
      throw new Error(`Album with title "${title}" not found`);
    }

    return {
      element: albumElement,
      title: await albumElement.locator(this.albumTitle).textContent(),
      artist: await albumElement.locator(this.albumArtist).textContent(),
      async click() {
        await albumElement.click();
      }
    };
  }

  async clickAlbum(index) {
    const album = await this.getAlbumByIndex(index);
    await album.click();

    // Wait for navigation to album detail page
    await this.page.waitForURL('**/albums/**');
    await this.page.waitForSelector('h1', { timeout: 10000 });
  }

  async clickAlbumByTitle(title) {
    const album = await this.getAlbumByTitle(title);
    await album.click();

    // Wait for navigation to album detail page
    await this.page.waitForURL('**/albums/**');
    await this.page.waitForSelector('h1', { timeout: 10000 });
  }

  async searchAlbums(query) {
    await this.page.fill(this.searchInput, query);
    await this.page.press(this.searchInput, 'Enter');
    await this.waitForLoad();
  }

  async sortBy(option) {
    await this.page.selectOption(this.sortDropdown, option);
    await this.waitForLoad();
  }

  async filterBy(option) {
    await this.page.selectOption(this.filterDropdown, option);
    await this.waitForLoad();
  }

  async loadMoreAlbums() {
    if (await this.page.locator(this.loadMoreButton).isVisible()) {
      await this.page.click(this.loadMoreButton);
      await this.waitForLoad();
      return true;
    }
    return false;
  }

  async getAllVisibleAlbums() {
    const albums = [];
    const albumElements = this.page.locator(this.albumCard);
    const count = await albumElements.count();

    for (let i = 0; i < count; i++) {
      const element = albumElements.nth(i);
      albums.push({
        title: await element.locator(this.albumTitle).textContent(),
        artist: await element.locator(this.albumArtist).textContent(),
        hasImage: await element.locator(this.albumImage).count() > 0
      });
    }

    return albums;
  }

  async verifyAlbumImages() {
    const images = this.page.locator(this.albumImage);
    const count = await images.count();
    const results = [];

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const src = await img.getAttribute('src');

      if (src) {
        // Check if image loads successfully
        const response = await this.page.request.get(src);
        results.push({
          src,
          loaded: response.ok(),
          status: response.status()
        });
      }
    }

    return results;
  }

  async startLibraryScan() {
    await this.page.click(this.scanLibraryButton);
  }
}
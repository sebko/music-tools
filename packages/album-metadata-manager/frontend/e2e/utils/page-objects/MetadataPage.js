export class MetadataPage {
  constructor(page) {
    this.page = page;

    // Selectors
    this.pageTitle = 'h1:has-text("Metadata"), h1:has-text("Lookup")';
    this.spotifySection = '[data-testid="spotify-metadata"], .spotify-section';
    this.musicbrainzSection = '[data-testid="musicbrainz-metadata"], .musicbrainz-section';
    this.discogsSection = '[data-testid="discogs-metadata"], .discogs-section';
    this.sourceRadio = 'input[type="radio"][name*="source"], input[type="radio"][name*="metadata"]';
    this.artworkRadio = 'input[type="radio"][name*="artwork"]';
    this.applyButton = 'button:has-text("Apply Metadata"), button:has-text("Apply"), [data-testid="apply-metadata"]';
    this.cancelButton = 'button:has-text("Cancel"), [data-testid="cancel"]';
    this.backButton = 'button:has-text("Back"), a:has-text("Back"), [data-testid="back"]';
    this.loadingIndicator = '[data-testid="loading"], .loading, .spinner';
    this.errorMessage = '[data-testid="error"], .error-message';
    this.successMessage = '[data-testid="success"], .success-message';
  }

  async waitForLoad() {
    await this.page.waitForSelector(this.pageTitle, { timeout: 10000 });
    await this.page.waitForLoadState('networkidle');
  }

  async waitForMetadataResults(timeoutMs = 15000) {
    // Wait for at least one metadata source to appear
    await this.page.waitForSelector('text=Spotify, text=MusicBrainz, text=Discogs', { timeout: timeoutMs });

    // Wait for loading indicators to disappear
    try {
      await this.page.waitForSelector(this.loadingIndicator, { state: 'hidden', timeout: 5000 });
    } catch {
      // Continue if no loading indicator found
    }
  }

  async getAvailableMetadataSources() {
    const sources = [];

    // Check for Spotify
    if (await this.page.locator('text=Spotify').count() > 0) {
      sources.push('spotify');
    }

    // Check for MusicBrainz
    if (await this.page.locator('text=MusicBrainz').count() > 0) {
      sources.push('musicbrainz');
    }

    // Check for Discogs
    if (await this.page.locator('text=Discogs').count() > 0) {
      sources.push('discogs');
    }

    return sources;
  }

  async selectMetadataSource(source) {
    const radioSelector = `input[type="radio"][value="${source}"], input[type="radio"]#${source}`;
    await this.page.click(radioSelector);

    // Wait for UI to update based on selection
    await this.page.waitForTimeout(500);
  }

  async selectArtworkSource(source) {
    const artworkRadioSelector = `input[type="radio"]#artwork-${source}, input[type="radio"][value="artwork-${source}"]`;
    await this.page.click(artworkRadioSelector);

    // Wait for UI to update
    await this.page.waitForTimeout(500);
  }

  async getMetadataPreview(source) {
    const sectionSelector = `[data-testid="${source}-metadata"], .${source}-section`;
    const section = this.page.locator(sectionSelector);

    if (await section.count() === 0) {
      return null;
    }

    return {
      title: await this.getMetadataField(section, 'title'),
      artist: await this.getMetadataField(section, 'artist'),
      year: await this.getMetadataField(section, 'year'),
      genre: await this.getMetadataField(section, 'genre'),
      trackCount: await this.getMetadataField(section, 'tracks')
    };
  }

  async getMetadataField(section, field) {
    try {
      const patterns = [
        `[data-testid="${field}"]`,
        `.${field}`,
        `text=${field}:`
      ];

      for (const pattern of patterns) {
        const element = section.locator(pattern);
        if (await element.count() > 0) {
          const text = await element.textContent();
          return text.includes(':') ? text.split(':')[1].trim() : text.trim();
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  async hasArtworkPreview(source) {
    const artworkSelector = `img[alt*="${source}"], img[src*="${source}"], [data-testid="${source}-artwork"]`;
    return await this.page.locator(artworkSelector).count() > 0;
  }

  async isApplyButtonEnabled() {
    const button = this.page.locator(this.applyButton);
    return await button.isEnabled();
  }

  async applyMetadata() {
    // Ensure apply button is enabled
    await this.page.waitForFunction(() => {
      const button = document.querySelector('button:has-text("Apply"), [data-testid="apply-metadata"]');
      return button && !button.disabled;
    }, { timeout: 5000 });

    await this.page.click(this.applyButton);

    // Wait for operation to complete
    await this.page.waitForTimeout(2000);
  }

  async cancelMetadata() {
    await this.page.click(this.cancelButton);
  }

  async goBack() {
    await this.page.click(this.backButton);
    await this.page.waitForURL('**/albums/**');
  }

  async waitForSuccessMessage(timeoutMs = 10000) {
    try {
      await this.page.waitForSelector(this.successMessage, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  async waitForErrorMessage(timeoutMs = 5000) {
    try {
      await this.page.waitForSelector(this.errorMessage, { timeout: timeoutMs });
      return await this.page.locator(this.errorMessage).textContent();
    } catch {
      return null;
    }
  }

  async handleDialog(accept = true, promptText = '') {
    this.page.on('dialog', async dialog => {
      console.log(`Dialog appeared: ${dialog.message()}`);
      if (dialog.type() === 'prompt' && promptText) {
        await dialog.accept(promptText);
      } else if (accept) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });
  }

  async testMetadataFlow(source, artworkSource = null) {
    // Wait for metadata to load
    await this.waitForMetadataResults();

    // Verify source is available
    const availableSources = await this.getAvailableMetadataSources();
    if (!availableSources.includes(source)) {
      throw new Error(`Metadata source "${source}" is not available. Available: ${availableSources.join(', ')}`);
    }

    // Select metadata source
    await this.selectMetadataSource(source);

    // Select artwork source if specified
    if (artworkSource) {
      await this.selectArtworkSource(artworkSource);
    }

    // Verify apply button is enabled
    const isEnabled = await this.isApplyButtonEnabled();
    if (!isEnabled) {
      throw new Error('Apply Metadata button is not enabled');
    }

    // Apply metadata
    await this.applyMetadata();

    // Wait for success or error
    const success = await this.waitForSuccessMessage();
    const error = await this.waitForErrorMessage();

    return {
      success,
      error,
      source,
      artworkSource
    };
  }
}
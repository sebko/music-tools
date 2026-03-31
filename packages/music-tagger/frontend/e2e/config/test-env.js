import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const testConfig = {
  // Test database configuration
  database: {
    testDbPath: join(__dirname, '../fixtures/test-music-library.db'),
    seedDataPath: join(__dirname, '../fixtures/albums.json')
  },

  // API endpoints for testing
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
    endpoints: {
      albums: '/api/albums',
      metadata: '/api/albums/:id/metadata/search',
      library: '/api/library',
      scan: '/api/library/scan',
      health: '/health'
    }
  },

  // External API mocking configuration
  mocks: {
    spotify: {
      enabled: true,
      fixturesPath: join(__dirname, '../fixtures/metadata-responses/spotify.json')
    },
    musicbrainz: {
      enabled: true,
      fixturesPath: join(__dirname, '../fixtures/metadata-responses/musicbrainz.json')
    },
    discogs: {
      enabled: true,
      fixturesPath: join(__dirname, '../fixtures/metadata-responses/discogs.json')
    }
  },

  // Test timeouts and delays
  timeouts: {
    pageLoad: 10000,
    apiResponse: 15000,
    metadataSearch: 20000,
    libraryScan: 30000
  },

  // Screenshot and visual testing configuration
  visual: {
    screenshotsDir: join(__dirname, '../reports/screenshots'),
    threshold: 0.1,
    viewports: {
      desktop: { width: 1280, height: 720 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 667 }
    }
  },

  // Test data configuration
  testData: {
    defaultAlbumId: 1,
    searchQueries: ['Test', 'Rock', 'Jazz'],
    metadataSources: ['spotify', 'musicbrainz', 'discogs']
  },

  // Environment-specific settings
  env: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isTest: process.env.NODE_ENV === 'test',
    isCI: !!process.env.CI,
    recordHAR: !!process.env.RECORD_HAR
  }
};

export default testConfig;
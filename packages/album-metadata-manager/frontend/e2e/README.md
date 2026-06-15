# E2E Testing Setup

This directory contains the end-to-end testing infrastructure for the album-metadata-manager application.

## Structure

```
e2e/
├── tests/                    # Test files
│   ├── albums.spec.js       # Album browsing and navigation tests
│   ├── metadata.spec.js     # Metadata lookup functionality tests
│   ├── library.spec.js      # Library scanning and management tests
│   └── visual.spec.js       # Visual regression tests
├── fixtures/                # Test data and mocks
│   ├── albums.json         # Sample album data for testing
│   └── metadata-responses/ # Mock external API responses
├── utils/                   # Test utilities and helpers
│   ├── test-fixtures.js    # Custom Playwright fixtures
│   ├── api-mocks.js        # External API mocking utilities
│   ├── database-setup.js   # Test database management
│   └── page-objects/       # Page object models
├── config/                  # Test configuration
│   └── test-env.js         # Environment-specific settings
└── reports/                 # Generated test reports and artifacts
```

## Testing Strategy

### Real API Calls (Internal)
- Album listing and pagination
- Album detail views
- Library scan progress
- Database operations
- Internal routing and navigation

### Mocked API Calls (External)
- Spotify API responses
- MusicBrainz API responses
- Discogs API responses
- File system access operations

## Running Tests

From the project root:

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests with UI mode
npm run test:e2e:ui

# Run specific test file
npx playwright test albums.spec.js

# Run tests in debug mode
npm run test:e2e:debug
```

## Test Features

### Custom Fixtures
- `albumBrowsingPage` - Pre-configured albums page with test data
- `metadataLookupPage` - Metadata search page with mocked APIs
- `libraryScanPage` - Library management functionality
- `visualTesting` - Consistent screenshot testing

### Page Object Models
- `AlbumsPage` - Albums grid and navigation
- `AlbumDetailPage` - Individual album views
- `MetadataPage` - Metadata lookup and application

### API Mocking
- External API responses are mocked for consistency
- Error scenarios can be simulated
- Rate limiting and network failures are testable

## Configuration

Tests are configured to:
- Start both frontend and backend development servers automatically
- Use test-specific environment variables
- Generate comprehensive reports and screenshots
- Support both local development and CI environments

## Reports

After running tests, find reports at:
- HTML Report: `e2e/reports/html-report/index.html`
- Screenshots: `e2e/reports/screenshots/`
- Network HAR files: `e2e/reports/network.har` (when enabled)
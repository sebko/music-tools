---
name: run-e2e-tests
description: "album-metadata-manager: Run Playwright end-to-end tests with selectable modes (headed, debug, UI, browser-specific, HAR, report)"
---
# run-e2e-tests

Run end-to-end tests for the album-metadata-manager application with various modes and options.

## Description

This command runs Playwright E2E tests with intelligent argument parsing. It supports multiple test modes including headless, headed, debug, UI mode, and browser-specific testing.

## Usage

You can use natural language to specify test modes:

- **`run e2e tests`** → Standard headless mode
- **`run e2e tests headed`** → Headed mode (visible browser)
- **`run e2e tests debug`** → Debug mode with breakpoints
- **`run e2e tests ui`** → Interactive UI mode
- **`run e2e tests chrome`** → Chrome only
- **`run e2e tests firefox`** → Firefox only
- **`run e2e tests webkit`** → Safari/WebKit only
- **`run e2e tests with har`** → Record network traffic
- **`run e2e tests basic`** → Run only basic.spec.js
- **`show e2e report`** → Open test results

## Implementation

```bash
#!/bin/bash

# Get all arguments as a single string for parsing
ARGS="$*"
ARGS_LOWER=$(echo "$ARGS" | tr '[:upper:]' '[:lower:]')

echo "🧪 Starting E2E tests..."

# Navigate to album-metadata-manager directory
cd packages/album-metadata-manager

# Check if servers are running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Backend server not running on port 3001"
    echo "💡 Run 'run-servers' first to start development servers"
    exit 1
fi

if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "❌ Frontend server not running on port 5173"
    echo "💡 Run 'run-servers' first to start development servers"
    exit 1
fi

echo "✅ Servers are running"

# Parse arguments and run appropriate test command
if [[ "$ARGS_LOWER" == *"report"* ]]; then
    echo "📊 Opening test report..."
    npx playwright show-report frontend/e2e/reports/html-report

elif [[ "$ARGS_LOWER" == *"debug"* ]]; then
    echo "🐛 Running tests in debug mode..."
    npm run test:e2e:debug

elif [[ "$ARGS_LOWER" == *"ui"* ]]; then
    echo "🖥️ Running tests in UI mode..."
    npm run test:e2e:ui

elif [[ "$ARGS_LOWER" == *"headed"* ]]; then
    echo "👁️ Running tests in headed mode..."
    npm run test:e2e:headed

elif [[ "$ARGS_LOWER" == *"chrome"* ]] || [[ "$ARGS_LOWER" == *"chromium"* ]]; then
    echo "🌐 Running tests in Chrome..."
    npm run test:e2e:chromium

elif [[ "$ARGS_LOWER" == *"firefox"* ]]; then
    echo "🦊 Running tests in Firefox..."
    npm run test:e2e:firefox

elif [[ "$ARGS_LOWER" == *"webkit"* ]] || [[ "$ARGS_LOWER" == *"safari"* ]]; then
    echo "🧭 Running tests in WebKit/Safari..."
    npm run test:e2e:webkit

elif [[ "$ARGS_LOWER" == *"har"* ]] || [[ "$ARGS_LOWER" == *"network"* ]]; then
    echo "📡 Running tests with network recording..."
    npm run test:e2e:with-har

elif [[ "$ARGS_LOWER" == *"basic"* ]]; then
    echo "⚡ Running basic tests only..."
    npx playwright test basic.spec.js

else
    echo "🏃 Running tests in headless mode..."
    npm run test:e2e
fi

# Show results summary
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Tests completed successfully!"
    echo "📊 View detailed report: npm run test:e2e:report"
    echo "🔍 Test artifacts: frontend/e2e/reports/"
else
    echo ""
    echo "❌ Some tests failed"
    echo "📊 View detailed report: npm run test:e2e:report"
    echo "🔍 Check test artifacts: frontend/e2e/reports/"
fi
```

## Available Test Modes

### Core Modes

- **Headless** (default): Fast, no browser UI
- **Headed**: See browser during tests
- **Debug**: Step through tests with breakpoints
- **UI**: Interactive test runner

### Browser-Specific

- **Chrome**: Test only in Chromium
- **Firefox**: Test only in Firefox
- **WebKit**: Test only in Safari/WebKit

### Special Modes

- **HAR Recording**: Capture network traffic
- **Basic Tests**: Run only basic functionality tests
- **Report**: View previous test results

## Pre-flight Checks

The command automatically verifies:

- ✅ Backend server is running (port 3001)
- ✅ Frontend server is running (port 5173)
- 🚀 Provides guidance if servers aren't running

## Examples

```bash
# Natural language examples:
"run e2e tests"                    → Headless mode
"run e2e tests headed"             → Headed mode
"run tests in debug mode"          → Debug mode
"run e2e tests in chrome"          → Chrome only
"run e2e tests with network recording" → HAR mode
"show me the e2e test report"      → Open report
```

## Performance & Timing

**Expected Duration**: ~9-12 minutes total

- **Setup phase**: 6-8 minutes (copying test music library from `/Volumes/T7/AlbumsTest`)
- **Test execution**: 2-3 minutes (6 tests across multiple workers)
- **Cleanup**: 30 seconds (removing temporary files)

**Note**: The majority of time is spent copying music files for test isolation. This ensures each test run has a clean, isolated music library.

## Dependencies

- Requires both frontend and backend servers to be running
- Uses npm scripts from package.json
- Playwright must be installed (`npm run test:e2e:install`)
- Sufficient disk space on T7 drive for temporary music library copy

## Troubleshooting

If tests fail to start:

1. Ensure servers are running: `run-servers`
2. Install Playwright browsers: `npm run test:e2e:install`
3. Check test artifacts in `frontend/e2e/reports/`

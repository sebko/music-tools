import { testDb } from './database-setup.js';

async function globalTeardown() {
  console.log('🧹 Running global teardown...');

  try {
    // Cleanup test database
    await testDb.cleanupTestDatabase();

    // Generate test report summary
    const fs = await import('fs');
    const path = await import('path');

    const reportsDir = path.join(process.cwd(), 'frontend/e2e/reports');
    const resultsFile = path.join(reportsDir, 'results.json');

    if (fs.existsSync(resultsFile)) {
      const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

      console.log('📊 Test Results Summary:');
      console.log(`   Tests: ${results.stats?.total || 'N/A'}`);
      console.log(`   Passed: ${results.stats?.expected || 'N/A'}`);
      console.log(`   Failed: ${results.stats?.unexpected || 'N/A'}`);
      console.log(`   Skipped: ${results.stats?.skipped || 'N/A'}`);
    }

    // Log useful information for debugging
    console.log('📁 Test artifacts generated:');
    console.log('   - HTML Report: frontend/e2e/reports/html-report/index.html');
    console.log('   - Screenshots: frontend/e2e/reports/screenshots/');
    console.log('   - Test Results: frontend/e2e/reports/results.json');

    if (process.env.RECORD_HAR) {
      console.log('   - Network HAR: frontend/e2e/reports/network.har');
    }

    console.log('✅ Global teardown complete');

  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - we don't want teardown failures to fail the test run
  }
}

export default globalTeardown;
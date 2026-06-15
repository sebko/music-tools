#!/usr/bin/env node

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class E2ETestRunner {
  constructor() {
    this.phases = [
      { name: 'Process Check', emoji: '🔍', description: 'Checking for running processes...' },
      { name: 'Cleanup', emoji: '🧹', description: 'Cleaning up previous test runs...' },
      { name: 'File Copy', emoji: '📁', description: 'Copying test files...' },
      { name: 'Server Start', emoji: '🚀', description: 'Starting test servers...' },
      { name: 'Test Execution', emoji: '🧪', description: 'Running tests...' }
    ];

    this.currentPhase = 0;
    this.testResults = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0
    };
    this.reportsGenerated = [];
  }

  logPhase(phaseIndex, status = 'running', details = '') {
    const phase = this.phases[phaseIndex];
    const statusEmoji = status === 'running' ? '⏳' : status === 'complete' ? '✅' : '❌';

    console.log(`${statusEmoji} ${phase.emoji} ${phase.name}: ${details || phase.description}`);
  }

  async checkExistingProcesses() {
    this.logPhase(0);

    try {
      // Quick check for obvious conflicts
      const { stdout: playwrightCheck } = await execAsync('pgrep -f "playwright.*test" || true');
      const { stdout: backendCheck } = await execAsync('lsof -ti:3001 || true');
      const { stdout: frontendCheck } = await execAsync('lsof -ti:5173,5174,5175,5176,5177,5178,5179,5180 || true');

      const conflicts = [
        playwrightCheck.trim() && 'Playwright tests',
        backendCheck.trim() && 'Backend (port 3001)',
        frontendCheck.trim() && 'Frontend (ports 5173-5180)'
      ].filter(Boolean);

      if (conflicts.length > 0) {
        console.log(`    Found running: ${conflicts.join(', ')}`);
        console.log(`    These will be cleaned up automatically`);
      }

      this.logPhase(0, 'complete', 'Process check completed');
    } catch (error) {
      console.log(`    Warning: Could not check processes: ${error.message}`);
      this.logPhase(0, 'complete', 'Process check completed (with warnings)');
    }
  }

  async findGeneratedReports() {
    const reportPaths = [
      { type: 'HTML Report', path: './frontend/e2e/reports/html-report/index.html', url: 'file://' },
      { type: 'JSON Report', path: './frontend/e2e/reports/results.json', url: 'file://' },
      { type: 'Playwright Report', path: './playwright-report/index.html', url: 'file://' }
    ];

    const availableReports = [];

    for (const report of reportPaths) {
      try {
        const fullPath = path.resolve(report.path);
        await fs.access(fullPath);

        // Get file stats to show when it was generated
        const stats = await fs.stat(fullPath);
        const isRecent = (Date.now() - stats.mtime.getTime()) < 5 * 60 * 1000; // Within last 5 minutes

        if (isRecent) {
          availableReports.push({
            type: report.type,
            path: fullPath,
            url: report.url + fullPath,
            mtime: stats.mtime
          });
        }
      } catch {
        // Report doesn't exist or can't be accessed
      }
    }

    return availableReports;
  }

  async displayResultsLinks() {
    const reports = await this.findGeneratedReports();

    if (reports.length > 0) {
      console.log('\n📊 Test Results Available:');
      console.log('─'.repeat(50));

      for (const report of reports) {
        const timeStr = report.mtime.toLocaleTimeString();
        console.log(`📋 ${report.type} (generated at ${timeStr})`);

        // Display clickable link for compatible terminals
        console.log(`   \x1b]8;;${report.url}\x1b\\${report.url}\x1b]8;;\x1b\\`);

        // For HTML reports, also show the command to open them
        if (report.type.includes('HTML') || report.type.includes('Playwright')) {
          console.log(`   📂 Path: ${report.path}`);
          console.log(`   💻 Command: open "${report.path}"`);
        }
        console.log();
      }

      // Show the npm commands to open reports
      console.log('🚀 Quick Commands:');
      console.log('   npm run test:e2e:results      # Auto-open latest report');
      console.log('   npm run test:e2e:report:open  # Open HTML report');
      console.log('   npm run test:e2e:report       # Open with Playwright viewer');
      console.log('   playwright show-report        # Alternative Playwright viewer');
    } else {
      console.log('\n📊 No recent test reports found (checked last 5 minutes)');
      console.log('💡 Reports will be available after test completion');
    }
  }

  parsePlaywrightOutput(data) {
    const output = data.toString();

    // Parse test execution progress
    const testMatch = output.match(/(\d+) passed.*?(\d+) failed.*?(\d+) skipped/);
    if (testMatch) {
      this.testResults.passed = parseInt(testMatch[1]);
      this.testResults.failed = parseInt(testMatch[2]);
      this.testResults.skipped = parseInt(testMatch[3]);
      this.testResults.total = this.testResults.passed + this.testResults.failed + this.testResults.skipped;

      const progress = this.testResults.total > 0 ?
        `${this.testResults.passed}/${this.testResults.total} tests passed` :
        'Tests in progress...';

      this.logPhase(4, 'running', progress);
    }

    // Detect phase transitions
    if (output.includes('Setting up clean E2E test environment')) {
      this.currentPhase = 1;
      this.logPhase(1);
    } else if (output.includes('Copying music library')) {
      this.currentPhase = 2;
      this.logPhase(2);
    } else if (output.includes('Starting')) {
      this.currentPhase = 3;
      this.logPhase(3);
    } else if (output.includes('Running') && output.includes('test')) {
      if (this.currentPhase < 4) {
        this.currentPhase = 4;
        this.logPhase(4);
      }
    }

    // Forward the output (but clean up excessive newlines)
    const cleanOutput = output.replace(/\n\s*\n\s*\n/g, '\n\n');
    if (cleanOutput.trim() && !cleanOutput.includes('[Webkit]') && !cleanOutput.includes('[Firefox]')) {
      process.stdout.write(cleanOutput);
    }
  }

  async runTests(playwrightArgs = []) {
    console.log('🎬 Starting Enhanced E2E Test Runner');
    console.log('═'.repeat(50));

    // Phase 1: Check existing processes
    await this.checkExistingProcesses();

    // Start Playwright with the enhanced setup
    const playwrightCmd = ['npx', 'playwright', 'test', ...playwrightArgs];

    console.log('\n🚀 Launching Playwright tests...');
    console.log(`Command: ${playwrightCmd.join(' ')}\n`);

    return new Promise((resolve, reject) => {
      const playwright = spawn(playwrightCmd[0], playwrightCmd.slice(1), {
        stdio: ['inherit', 'pipe', 'pipe']
      });

      playwright.stdout.on('data', (data) => {
        this.parsePlaywrightOutput(data);
      });

      playwright.stderr.on('data', (data) => {
        this.parsePlaywrightOutput(data);
      });

      playwright.on('close', async (code) => {
        console.log('\n' + '═'.repeat(50));

        if (code === 0) {
          console.log('🎉 All tests completed successfully!');
          if (this.testResults.total > 0) {
            console.log(`📊 Final Results: ${this.testResults.passed} passed, ${this.testResults.failed} failed, ${this.testResults.skipped} skipped`);
          }
        } else if (code === null) {
          console.log('⚠️  Tests were interrupted');
        } else {
          console.log(`❌ Tests failed with exit code ${code}`);
          if (this.testResults.total > 0) {
            console.log(`📊 Results: ${this.testResults.passed} passed, ${this.testResults.failed} failed, ${this.testResults.skipped} skipped`);
          }
        }

        // Always try to display results links, even if tests failed
        await this.displayResultsLinks();

        resolve(code || 1);
      });

      playwright.on('error', (error) => {
        console.error(`❌ Failed to start Playwright: ${error.message}`);
        reject(error);
      });
    });
  }
}

// CLI Interface
async function main() {
  const runner = new E2ETestRunner();

  // Pass through any command line arguments to Playwright
  const playwrightArgs = process.argv.slice(2);

  try {
    const exitCode = await runner.runTests(playwrightArgs);
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  }
}

// Handle SIGINT gracefully
process.on('SIGINT', () => {
  console.log('\n\n🛑 Test runner interrupted by user');
  process.exit(130);
});

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default E2ETestRunner;
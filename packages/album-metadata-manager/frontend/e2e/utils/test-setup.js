import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

class TestEnvironment {
  constructor() {
    this.sourceMusicPath = process.env.MUSIC_LIBRARY_PATH || "/Volumes/T7/AlbumsTest";
    this.tempMusicPath = null;
  }

  async checkRunningProcesses() {
    console.log("🔍 Checking for running e2e processes...");

    const processChecks = [
      { name: "Playwright tests", cmd: 'pgrep -f "playwright.*test"' },
      { name: "Test backends (port 3001)", cmd: "lsof -ti:3001" },
      {
        name: "Test frontends (ports 5173-5180)",
        cmd: "lsof -ti:5173,5174,5175,5176,5177,5178,5179,5180",
      },
      { name: "Previous test music dirs", cmd: `ls -d ${path.dirname(this.sourceMusicPath)}/test-music-* 2>/dev/null` },
    ];

    const runningProcesses = [];

    for (const check of processChecks) {
      try {
        const { stdout } = await execAsync(check.cmd);
        if (stdout.trim()) {
          runningProcesses.push({ name: check.name, pids: stdout.trim().split("\n") });
        }
      } catch {
        // Command failed (no processes found) - this is expected
      }
    }

    return runningProcesses;
  }

  async killRunningProcesses(runningProcesses) {
    if (runningProcesses.length === 0) {
      console.log("✅ No conflicting processes found");
      return;
    }

    console.log("🧹 Cleaning up conflicting processes...");

    for (const process of runningProcesses) {
      console.log(`  Stopping ${process.name}...`);

      if (process.name.includes("test music dirs")) {
        // Clean up old test directories
        for (const dir of process.pids) {
          try {
            await execAsync(`rm -rf "${dir}"`);
            console.log(`    Removed: ${dir}`);
          } catch (error) {
            console.log(`    Warning: Could not remove ${dir}: ${error.message}`);
          }
        }
      } else {
        // Kill processes
        for (const pid of process.pids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`    Killed PID: ${pid}`);
          } catch (error) {
            console.log(`    Warning: Could not kill PID ${pid}: ${error.message}`);
          }
        }
      }
    }

    // Wait a moment for processes to fully terminate
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log("✅ Process cleanup complete");
  }

  async copyMusicLibraryWithProgress() {
    const uuid = Math.random().toString(36).slice(2, 10);
    const tempDir = process.env.TEST_TEMP_DIR || path.dirname(this.sourceMusicPath);
    this.tempMusicPath = `${tempDir}/test-music-${uuid}`;

    console.log(`🎵 Copying music library: ${this.sourceMusicPath} → ${this.tempMusicPath}`);
    console.log(`📁 Using ${tempDir} for temp copy`);

    return new Promise((resolve, reject) => {
      // Use rsync for progress monitoring
      const rsyncCmd = [
        "rsync",
        "-av",
        "--progress",
        "--info=progress2",
        `${this.sourceMusicPath}/`,
        `${this.tempMusicPath}/`,
      ];

      const rsync = spawn(rsyncCmd[0], rsyncCmd.slice(1));

      let lastProgress = "";
      let progressShown = false;

      rsync.stdout.on("data", data => {
        const output = data.toString();

        // Parse rsync progress output
        const progressMatch = output.match(/(\d+)%.*?(\d+(?:\.\d+)?[KMGT]?B\/s)/);
        if (progressMatch) {
          const [, percentage, speed] = progressMatch;
          const progressBar =
            "█".repeat(Math.floor(parseInt(percentage) / 5)) +
            "░".repeat(20 - Math.floor(parseInt(percentage) / 5));

          const progressLine = `    📁 [${progressBar}] ${percentage}% (${speed})`;

          if (progressLine !== lastProgress) {
            if (progressShown) {
              // Clear previous line
              process.stdout.write("\r\x1b[K");
            }
            process.stdout.write(progressLine);
            lastProgress = progressLine;
            progressShown = true;
          }
        }
      });

      rsync.stderr.on("data", data => {
        // Rsync sends progress to stderr too, handle it
        const output = data.toString();
        if (!output.includes("speedup is")) {
          console.error(`Rsync error: ${output}`);
        }
      });

      rsync.on("close", code => {
        if (progressShown) {
          console.log(""); // New line after progress
        }

        if (code === 0) {
          console.log(`✅ Music library copied successfully`);
          resolve();
        } else {
          reject(new Error(`Rsync failed with code ${code}`));
        }
      });

      rsync.on("error", error => {
        reject(error);
      });
    });
  }

  async setup() {
    console.log("🧪 Setting up clean E2E test environment...");

    try {
      // 1. Check for and clean up running processes
      const runningProcesses = await this.checkRunningProcesses();
      await this.killRunningProcesses(runningProcesses);

      // 2. Copy music library with progress reporting
      await this.copyMusicLibraryWithProgress();

      // 3. Set environment variable for test servers to use
      process.env.TEST_MUSIC_LIBRARY_PATH = this.tempMusicPath;
      console.log(`🔧 Set TEST_MUSIC_LIBRARY_PATH=${this.tempMusicPath}`);

      // 4. Create reports directory if needed
      const reportsDir = path.join(process.cwd(), "frontend/e2e/reports");
      const screenshotsDir = path.join(reportsDir, "screenshots");

      await fs.mkdir(reportsDir, { recursive: true });
      await fs.mkdir(screenshotsDir, { recursive: true });

      console.log("✅ Test environment setup complete");

      return {
        tempMusicPath: this.tempMusicPath,
      };
    } catch (error) {
      console.error("❌ Test environment setup failed:", error);
      throw error;
    }
  }

  async cleanup() {
    console.log("🧹 Cleaning up test environment...");

    try {
      if (this.tempMusicPath) {
        console.log(`🗑️ Removing temp music directory: ${this.tempMusicPath}`);
        await execAsync(`rm -rf "${this.tempMusicPath}"`);
        console.log("✅ Temp music directory cleaned up");
      }

      console.log("✅ Test environment cleanup complete");
    } catch (error) {
      console.error("❌ Test environment cleanup failed:", error);
      // Don't throw - cleanup failure shouldn't fail tests
    }
  }
}

// Create singleton instance
const testEnv = new TestEnvironment();

// Global setup function
async function globalSetup() {
  return await testEnv.setup();
}

// Global teardown function
async function globalTeardown() {
  return await testEnv.cleanup();
}

// Export setup as default, teardown as named export
export default globalSetup;
export { globalTeardown };

// For Playwright's global teardown, we need to export a separate file
// Since Playwright expects a default export for teardown
export const teardown = globalTeardown;

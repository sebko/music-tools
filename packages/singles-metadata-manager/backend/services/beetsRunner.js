import { execFile, spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BEETS_DIR = join(__dirname, "..", "..", "beets");
const PYTHON = join(BEETS_DIR, ".venv", "bin", "python");
const BEET_BIN = join(homedir(), ".local", "bin", "beet");

/**
 * Run a Python script from beets/scripts/ directory.
 * Returns { stdout, stderr, code }.
 */
export function runScript(scriptName, args = []) {
  const scriptPath = join(BEETS_DIR, "scripts", scriptName);
  return new Promise((resolve, reject) => {
    const proc = execFile(PYTHON, [scriptPath, ...args], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 600000, // 10 min
    }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error("Script timed out"));
        return;
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: error ? error.code : 0,
      });
    });
    return proc;
  });
}

/**
 * Spawn a beet CLI command and stream stdout/stderr lines via callback.
 * Used for long-running operations (import, duplicates) where the wizard
 * wants live progress. Returns { code, stdout, stderr } when the process exits.
 *
 * @param {string[]} args
 * @param {(chunk: string, stream: "stdout" | "stderr") => void} onChunk
 */
export function runBeetStreaming(args = [], onChunk = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(BEET_BIN, args, { env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      onChunk(chunk, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      onChunk(chunk, "stderr");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code: code ?? 0 });
    });
  });
}

/**
 * Run a beet CLI command.
 * Returns { stdout, stderr, code }.
 */
export function runBeet(args = []) {
  return new Promise((resolve, reject) => {
    execFile(BEET_BIN, args, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 300000, // 5 min
    }, (error, stdout, stderr) => {
      if (error && error.killed) {
        reject(new Error("Beet command timed out"));
        return;
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: error ? error.code : 0,
      });
    });
  });
}

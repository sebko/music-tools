/**
 * Timestamp Preservation Utility
 *
 * macOS APFS birthtime (Date Created) is immutable through standard APIs
 * (touch, utimes). This utility uses SetFile (Xcode CLT) or Python ctypes
 * to call setattrlist() — the only reliable way to restore birthtime on macOS.
 */

import { stat } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Capture birthtime and mtime from a file
 *
 * @param {string} filePath - Full path to the file
 * @returns {Promise<{birthtime: Date, mtime: Date}>}
 */
export async function captureTimestamps(filePath) {
  const s = await stat(filePath);
  return { birthtime: s.birthtime, mtime: s.mtime };
}

/**
 * Restore birthtime on a macOS file
 *
 * Only restores birthtime (Date Created). mtime (Date Modified) is intentionally
 * left as-is so it reflects when the metadata was written.
 *
 * Tries SetFile first (Xcode CLT), falls back to Python ctypes setattrlist().
 *
 * @param {string} filePath - Full path to the file
 * @param {{birthtime: Date, mtime: Date}} timestamps - Captured timestamps
 */
export async function restoreTimestamps(filePath, timestamps) {
  if (!timestamps?.birthtime) return;

  // Restore birthtime only (requires macOS-specific approach)
  await restoreBirthtime(filePath, timestamps.birthtime);
}

/**
 * Restore birthtime on macOS using SetFile or Python setattrlist()
 *
 * @param {string} filePath
 * @param {Date} birthtime
 */
async function restoreBirthtime(filePath, birthtime) {
  try {
    await restoreWithSetFile(filePath, birthtime);
  } catch {
    await restoreWithPython(filePath, birthtime);
  }
}

/**
 * Format a Date as SetFile expects: 'MM/DD/YYYY HH:MM:SS'
 */
function formatSetFileDate(date) {
  const M = String(date.getMonth() + 1).padStart(2, "0");
  const D = String(date.getDate()).padStart(2, "0");
  const Y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${M}/${D}/${Y} ${h}:${m}:${s}`;
}

/**
 * Use SetFile (Xcode CLT) to set birthtime
 */
async function restoreWithSetFile(filePath, birthtime) {
  const dateStr = formatSetFileDate(birthtime);
  await execFileAsync("SetFile", ["-d", dateStr, filePath]);
}

/**
 * Use Python ctypes to call setattrlist() for birthtime
 *
 * This is the fallback when SetFile isn't available.
 * Python is always present on macOS.
 */
async function restoreWithPython(filePath, birthtime) {
  const epochSeconds = birthtime.getTime() / 1000;

  const script = `
import sys, struct, ctypes, ctypes.util

path = sys.argv[1]
epoch = float(sys.argv[2])

libc = ctypes.CDLL(ctypes.util.find_library('c'))

class AttrList(ctypes.Structure):
    _fields_ = [
        ('bitmapcount', ctypes.c_uint32),
        ('reserved', ctypes.c_uint32),
        ('commonattr', ctypes.c_uint32),
        ('volattr', ctypes.c_uint32),
        ('dirattr', ctypes.c_uint32),
        ('fileattr', ctypes.c_uint32),
        ('forkattr', ctypes.c_uint32),
    ]

attrs = AttrList()
attrs.bitmapcount = 6  # ATTR_BIT_MAP_COUNT
attrs.commonattr = 0x00000200  # ATTR_CMN_CRTIME

# timespec: { tv_sec, tv_nsec }
buf = struct.pack('qq', int(epoch), 0)

result = libc.setattrlist(
    ctypes.c_char_p(path.encode('utf-8')),
    ctypes.byref(attrs),
    buf,
    len(buf),
    0
)
sys.exit(result)
`;

  await execFileAsync("python3", ["-c", script, filePath, String(epochSeconds)]);
}

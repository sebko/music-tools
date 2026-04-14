import { readdir } from "fs/promises";
import { join } from "path";

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^\d{4}-\d{2} [A-Z]/;

/**
 * Walk a library root and return absolute paths for every month folder
 * matching the YYYY/YYYY-MM MonthName layout.
 */
export async function enumerateMonthFolders(libraryPath) {
  const folders = [];
  let years;
  try {
    years = await readdir(libraryPath, { withFileTypes: true });
  } catch {
    return folders;
  }
  for (const y of years) {
    if (!y.isDirectory() || !YEAR_RE.test(y.name)) continue;
    const yearPath = join(libraryPath, y.name);
    let months;
    try {
      months = await readdir(yearPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const m of months) {
      if (!m.isDirectory() || !MONTH_RE.test(m.name)) continue;
      folders.push(join(yearPath, m.name));
    }
  }
  return folders.sort();
}

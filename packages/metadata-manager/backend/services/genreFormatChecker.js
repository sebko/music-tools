import { parseFile } from "music-metadata";

/**
 * Check the genre encoding format of a single audio file.
 *
 * Uses music-metadata's parsing to determine whether genres are stored as
 * proper multi-value tags (null-byte separated in ID3v2.4 TCON, or multiple
 * Vorbis GENRE comments for FLAC) vs incorrectly joined strings.
 *
 * music-metadata normalises multi-value tags into an array in common.genre:
 *  - Correct multi-value → common.genre = ["House", "Deep House"]
 *  - Joined single string → common.genre = ["House, Deep House"]
 *  - Single genre → common.genre = ["House"]
 *  - No genres → common.genre = []
 *
 * @param {string} filePath - Absolute path to the audio file
 * @returns {{ genres: string[], correctlyFormatted: boolean, hasGenres: boolean }}
 */
export async function checkGenreFormat(filePath) {
  const metadata = await parseFile(filePath);
  const genres = metadata.common.genre || [];

  if (genres.length === 0) {
    return { genres: [], correctlyFormatted: true, hasGenres: false };
  }

  // Any entry containing a comma or semicolon is a joined string and the
  // file needs re-encoding — even if there are multiple entries already
  // (a half-normalised file like ['House;Deep House', 'Trip Hop'] still
  // collapses incorrectly in Pentaton).
  const hasJoinedEntry = genres.some((g) => g.includes(",") || g.includes(";"));
  if (hasJoinedEntry) {
    return { genres, correctlyFormatted: false, hasGenres: true };
  }

  return { genres, correctlyFormatted: true, hasGenres: true };
}

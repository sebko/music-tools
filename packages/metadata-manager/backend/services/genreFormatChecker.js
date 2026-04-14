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

  // Multiple entries → music-metadata parsed multi-value tags correctly
  if (genres.length > 1) {
    return { genres, correctlyFormatted: true, hasGenres: true };
  }

  // Single entry with no comma/semicolon → legitimate single genre
  const single = genres[0];
  if (!single.includes(",") && !single.includes(";")) {
    return { genres, correctlyFormatted: true, hasGenres: true };
  }

  // Single entry containing comma or semicolon → joined string instead of
  // proper multi-value encoding
  return { genres, correctlyFormatted: false, hasGenres: true };
}

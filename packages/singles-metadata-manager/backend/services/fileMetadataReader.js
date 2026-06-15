import { parseFile } from "music-metadata";

/**
 * Extract embedded artwork from a single audio file.
 */
export async function getTrackArtwork(filePath) {
  try {
    const metadata = await parseFile(filePath);
    const picture = metadata.common.picture?.[0];
    if (!picture || !picture.data) return null;
    return {
      data: picture.data,
      format: picture.format || "image/jpeg",
    };
  } catch (error) {
    console.error(`Error extracting artwork from ${filePath}:`, error.message);
    return null;
  }
}

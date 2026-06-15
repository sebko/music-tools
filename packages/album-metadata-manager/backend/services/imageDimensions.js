import probe from "probe-image-size";

/**
 * Get image dimensions from a URL
 * Uses probe-image-size which only fetches the minimum bytes needed
 * to determine dimensions (doesn't download the full image)
 *
 * @param {string} url - Image URL to probe
 * @returns {Promise<{width: number, height: number} | null>} Dimensions or null if failed
 */
export async function getImageDimensions(url) {
  if (!url) return null;

  try {
    const result = await probe(url, { timeout: 10000 });
    return { width: result.width, height: result.height };
  } catch (error) {
    console.error("Failed to get image dimensions:", error.message);
    return null;
  }
}

/**
 * Get image dimensions from a buffer
 * Uses probe-image-size to analyze the buffer directly
 *
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<{width: number, height: number} | null>} Dimensions or null if failed
 */
export async function getImageDimensionsFromBuffer(buffer) {
  if (!buffer) return null;

  try {
    const result = await probe.sync(buffer);
    return { width: result.width, height: result.height };
  } catch (error) {
    console.error("Failed to get image dimensions from buffer:", error.message);
    return null;
  }
}

/**
 * Minimum dimension for high-resolution artwork
 * Both width and height must be >= this value
 */
export const HD_ARTWORK_MIN_SIZE = 1400;

/**
 * Check if dimensions qualify as high-resolution
 * @param {number|null} width
 * @param {number|null} height
 * @returns {boolean}
 */
export function isHdArtwork(width, height) {
  if (width == null || height == null) return false;
  return width >= HD_ARTWORK_MIN_SIZE && height >= HD_ARTWORK_MIN_SIZE;
}

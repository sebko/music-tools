// Utility functions for metadata processing

/**
 * Enhanced text normalization for better matching
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (!text) return "";

  return (
    text
      .toLowerCase()
      .trim()
      // Normalize punctuation and spacing
      .replace(/[:\-–—]/g, " ") // Replace colons, dashes with spaces
      .replace(/['"]/g, "") // Remove quotes
      .replace(/\./g, " ") // Replace dots with spaces
      .replace(/[()[\]{}]/g, " ") // Replace brackets with spaces
      .replace(/&/g, "and") // Replace & with and
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim()
  );
}

/**
 * Extract keywords from text, removing common stop words
 * @param {string} text - Text to extract keywords from
 * @returns {string[]} Array of keywords
 */
export function extractKeywords(text) {
  if (!text) return [];

  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "vol",
    "volume",
    "pt",
    "part",
    "ep",
    "single",
    "album",
    "soundtrack",
    "ost",
    "deluxe",
    "edition",
    "remaster",
    "remastered",
    "expanded",
    "special",
    "limited",
    "anniversary",
  ]);

  return normalizeText(text)
    .split(" ")
    .filter(word => word.length > 1 && !stopWords.has(word))
    .filter(Boolean);
}

/**
 * Fetch image dimensions and file size without downloading the full image
 * @param {string} imageUrl - URL of the image
 * @returns {Promise<{width: number, height: number, fileSize: number, contentType: string}|null>}
 */
export async function getImageDimensions(imageUrl) {
  try {
    // First try HEAD request to get file size
    const headResponse = await fetch(imageUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "MusicTagger/2.0",
      },
    });

    const fileSize = parseInt(headResponse.headers.get("content-length") || "0");
    const contentType = headResponse.headers.get("content-type") || "image/jpeg";

    // For now, we'll need to fetch a small portion of the image to get dimensions
    // This is a limitation, but most image servers support range requests
    try {
      const response = await fetch(imageUrl, {
        headers: {
          Range: "bytes=0-65535", // First 64KB should contain image headers
          "User-Agent": "MusicTagger/2.0",
        },
      });

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());

        // Parse dimensions based on image type
        const dimensions = parseImageDimensions(buffer, contentType);

        if (dimensions) {
          return {
            width: dimensions.width,
            height: dimensions.height,
            fileSize,
            contentType,
          };
        }
      }
    } catch (rangeError) {
      console.log("Range request failed, falling back to HEAD data only");
    }

    // If we can't get dimensions, return file size at least
    return {
      width: null,
      height: null,
      fileSize,
      contentType,
    };
  } catch (error) {
    console.error("Error fetching image dimensions:", error);
    return null;
  }
}

/**
 * Parse image dimensions from buffer based on image type
 * @param {Buffer} buffer - Image data buffer
 * @param {string} contentType - MIME type
 * @returns {{width: number, height: number}|null}
 */
function parseImageDimensions(buffer, contentType) {
  try {
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      // JPEG parsing - look for SOF markers
      for (let i = 0; i < buffer.length - 10; i++) {
        if (buffer[i] === 0xff) {
          const marker = buffer[i + 1];
          // SOF0 to SOF2 markers (0xC0-0xC2)
          if (marker >= 0xc0 && marker <= 0xc2) {
            const height = buffer.readUInt16BE(i + 5);
            const width = buffer.readUInt16BE(i + 7);
            if (width && height) {
              return { width, height };
            }
          }
        }
      }
    } else if (contentType.includes("png")) {
      // PNG parsing - dimensions are in IHDR chunk
      if (buffer.length > 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        if (width && height) {
          return { width, height };
        }
      }
    }
  } catch (error) {
    console.error("Error parsing image dimensions:", error);
  }

  return null;
}

/**
 * Calculate image quality score based on dimensions
 * @param {Object} dimensions - Object with width and height properties
 * @returns {string} Quality score: 'excellent', 'high', 'good', 'medium', 'low', 'unknown'
 */
export function calculateImageQuality(dimensions) {
  if (!dimensions || !dimensions.width || !dimensions.height) {
    return "unknown";
  }

  const minDimension = Math.min(dimensions.width, dimensions.height);

  if (minDimension >= 1500) return "excellent";
  if (minDimension >= 1000) return "high";
  if (minDimension >= 600) return "good";
  if (minDimension >= 300) return "medium";
  return "low";
}

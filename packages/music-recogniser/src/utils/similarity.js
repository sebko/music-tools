/**
 * String similarity utilities using Levenshtein distance
 */

/**
 * Calculate string similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateStringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Levenshtein distance
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check if two results are similar enough to be considered the same track
 * @param {Object} result1 - First result
 * @param {Object} result2 - Second result
 * @param {number} threshold - Similarity threshold (default: 0.8)
 * @returns {boolean} True if similar
 */
function areResultsSimilar(result1, result2, threshold = 0.8) {
  const titleSimilarity = calculateStringSimilarity(
    result1.title.toLowerCase(),
    result2.title.toLowerCase()
  );
  
  const artistSimilarity = calculateStringSimilarity(
    result1.artist.toLowerCase(),
    result2.artist.toLowerCase()
  );
  
  // Consider similar if both title and artist have > threshold similarity
  return titleSimilarity > threshold && artistSimilarity > threshold;
}

module.exports = {
  calculateStringSimilarity,
  levenshteinDistance,
  areResultsSimilar
};
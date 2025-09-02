/**
 * @fileoverview Music Recogniser Package
 * A pure audio recognition API with intensity modes using multiple services
 */

// Load environment variables from package directory
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const MusicRecogniser = require('./MusicRecognizer');
const ShazamService = require('./services/shazam');
const AudDService = require('./services/audd');
const ACRCloudService = require('./services/acrcloud');
const AudioProcessor = require('./audio/processor');

// Utility exports
const { calculateStringSimilarity, areResultsSimilar } = require('./utils/similarity');
const { crossReferenceResults, groupSimilarResults } = require('./utils/consensus');

/**
 * Create a new MusicRecogniser instance with default configuration
 * @param {Object} options - Configuration options
 * @returns {MusicRecogniser} Configured recogniser instance
 */
function createRecogniser(options = {}) {
  return new MusicRecogniser(options);
}

/**
 * Quick identification function for simple use cases
 * @param {string|Buffer} audioData - Audio file path or buffer
 * @param {Object} options - Recognition options
 * @returns {Promise<Object|null>} Recognition result
 */
async function identify(audioData, options = {}) {
  const recogniser = new MusicRecogniser(options);
  return await recogniser.identify(audioData);
}

module.exports = {
  // Main classes
  MusicRecogniser,
  AudioProcessor,
  
  // Individual services
  ShazamService,
  AudDService,
  ACRCloudService,
  
  // Utility functions
  calculateStringSimilarity,
  areResultsSimilar,
  crossReferenceResults,
  groupSimilarResults,
  
  // Convenience functions
  createRecogniser,
  identify,
  
  // Default export for ES modules compatibility
  default: MusicRecogniser
};
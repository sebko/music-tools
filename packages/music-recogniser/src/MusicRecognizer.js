const ShazamService = require('./services/shazam');
const AudDService = require('./services/audd');
const ACRCloudService = require('./services/acrcloud');
const AudioProcessor = require('./audio/processor');
const { crossReferenceResults } = require('./utils/consensus');

/**
 * Main MusicRecogniser class for pure audio recognition
 * 
 * Features:
 * - Multi-service recognition (Shazam, AudD, ACRCloud)
 * - Intensity modes: quick, ham, ultra
 * - Strategic audio sampling for better accuracy
 * - Cross-reference validation using consensus algorithms
 * - Pure audio input - no YouTube/video processing
 */
class MusicRecogniser {
  constructor(options = {}) {
    // Apply intensity mode preset if specified
    const presetOptions = this.getIntensityModePreset(options.mode);
    const mergedOptions = { ...presetOptions, ...options };

    // Initialize services with optional API keys
    this.services = {
      shazam: new ShazamService(mergedOptions.shazam || {}),
      audd: new AudDService(mergedOptions.audd || {}),
      acrcloud: new ACRCloudService(mergedOptions.acrcloud || {})
    };

    // Initialize audio processor
    this.audioProcessor = new AudioProcessor(mergedOptions.audio || {});

    // Configuration options
    this.options = {
      // Intensity mode
      mode: mergedOptions.mode || 'quick',
      
      // Service selection
      enabledServices: mergedOptions.services || ['shazam', 'audd', 'acrcloud'],
      useAllServices: mergedOptions.useAllServices || false,
      
      // Recognition behavior
      consensusThreshold: mergedOptions.consensusThreshold || 0.7,
      timeout: mergedOptions.timeout || 30000,
      quickMode: mergedOptions.quickMode !== false, // Default to true
      confidenceThreshold: mergedOptions.confidenceThreshold || 0.85,
      
      // Audio processing
      segmentDuration: mergedOptions.segmentDuration || 10,
      samplePoints: mergedOptions.samplePoints || [0.1, 0.3, 0.5, 0.7, 0.9],
      maxAttempts: mergedOptions.maxAttempts || 5,
      
      // Output options
      includeRawResults: mergedOptions.includeRawResults || false,
      includeAlternateMatches: mergedOptions.includeAlternateMatches || false,
      
      ...mergedOptions
    };

    // Track alternate matches for user reference
    this.alternateMatches = [];
  }

  /**
   * Get intensity mode preset configuration
   * @param {string} mode - Intensity mode ('quick', 'ham', 'ultra')
   * @returns {Object} Preset configuration
   */
  getIntensityModePreset(mode) {
    const presets = {
      quick: {
        quickMode: true,
        confidenceThreshold: 0.85,
        maxAttempts: 5,
        samplePoints: [0.1, 0.3, 0.5, 0.7, 0.9],  // 5 samples
        segmentDuration: 10,
        timeout: 30000,
        useAllServices: false,
        consensusThreshold: 0.7,
        includeAlternateMatches: false
      },
      
      ham: {
        quickMode: false,  // Don't exit early
        confidenceThreshold: 0.8,
        maxAttempts: 10,
        samplePoints: [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95],  // 10 samples
        segmentDuration: 15,
        timeout: 45000,
        useAllServices: true,  // All 3 services
        consensusThreshold: 0.8,
        includeAlternateMatches: true,
        includeRawResults: false
      },
      
      ultra: {
        quickMode: false,  // Never exit early
        confidenceThreshold: 0.9,
        maxAttempts: 20,
        samplePoints: [0.02, 0.08, 0.15, 0.22, 0.28, 0.35, 0.42, 0.48, 0.55, 0.62, 0.68, 0.75, 0.82, 0.88, 0.95],  // 15 samples
        segmentDuration: 20,
        timeout: 90000,  // 1.5 minutes
        useAllServices: true,
        consensusThreshold: 0.9,
        includeAlternateMatches: true,
        includeRawResults: true
      }
    };

    return presets[mode] || presets.quick;
  }

  /**
   * Get all available and configured services
   * @returns {Array} Array of configured services
   */
  getAvailableServices() {
    const services = [];
    
    for (const [name, service] of Object.entries(this.services)) {
      if (this.options.enabledServices.includes(name) && service.isConfigured()) {
        services.push({ name, service });
      }
    }
    
    return services;
  }

  /**
   * Identify a track from audio file or buffer
   * @param {string|Buffer} audioData - Path to audio file or audio buffer
   * @param {Object} options - Override options for this recognition
   * @returns {Promise<Object|null>} Recognition result or null if not found
   */
  async identify(audioData, options = {}) {
    const startTime = Date.now();
    
    // Merge options for this call
    const callOptions = { ...this.options, ...options };
    
    console.log('🎯 Starting music recognition...');
    
    try {
      // Check if ffmpeg is available for audio processing
      if (typeof audioData === 'string') {
        const ffmpegAvailable = await this.audioProcessor.checkFfmpegAvailability();
        if (!ffmpegAvailable) {
          throw new Error('FFmpeg is required for audio file processing. Please install FFmpeg.');
        }
      }

      // Get available services
      const availableServices = this.getAvailableServices();
      
      if (availableServices.length === 0) {
        throw new Error('No music recognition services configured. Please provide API keys.');
      }

      console.log(`🔍 Using ${availableServices.length} recognition services...`);

      let result = null;
      
      // Try strategic sampling for single tracks
      if (typeof audioData === 'string') {
        result = await this.identifyWithStrategicSampling(audioData, availableServices, callOptions);
      } else {
        // Direct recognition for audio buffers
        result = await this.identifyWithServices(audioData, availableServices, callOptions);
      }

      if (result) {
        const processingTime = Date.now() - startTime;
        console.log(`✓ Recognition completed in ${processingTime}ms`);
        
        // Add processing metadata
        result.processing_time_ms = processingTime;
        result.services_used = result.services || [result.service];
        
        // Clean up raw data if not requested
        if (!callOptions.includeRawResults) {
          delete result.raw;
          if (result.individual_results) {
            result.individual_results.forEach(r => delete r.raw);
          }
        }
        
        return result;
      }

      console.log('❌ No tracks identified');
      return null;

    } catch (error) {
      console.error('Recognition error:', error.message);
      throw error;
    }
  }

  /**
   * Identify track using strategic sampling of audio file
   * @param {string} audioPath - Path to audio file
   * @param {Array} services - Available services
   * @param {Object} options - Recognition options
   * @returns {Promise<Object|null>} Recognition result
   */
  async identifyWithStrategicSampling(audioPath, services, options) {
    const tempFiles = [];
    
    try {
      // Create strategic samples
      const segments = await this.audioProcessor.createStrategicSamples(
        audioPath,
        options.samplePoints,
        options.segmentDuration
      );
      
      tempFiles.push(...segments.map(s => s.path));
      
      let bestResult = null;
      let attemptCount = 0;
      
      // Try each segment until we get a good result or run out of attempts
      for (const segment of segments) {
        if (attemptCount >= options.maxAttempts) {
          break;
        }
        
        console.log(`🎵 Trying sample at ${Math.round(segment.samplePoint * 100)}% (${this.audioProcessor.formatDuration(segment.startTime)})`);
        
        const result = await this.identifyWithServices(segment.path, services, options);
        attemptCount++;
        
        if (result) {
          // Add segment info to result
          result.recognized_segment = {
            sample_point: segment.samplePoint,
            start_time: segment.startTime,
            duration: segment.duration
          };
          
          // If quick mode and high confidence, return immediately
          if (options.quickMode && result.confidence >= options.confidenceThreshold) {
            console.log(`⚡ Quick mode: High confidence result found (${result.confidence.toFixed(2)})`);
            await this.audioProcessor.cleanup(tempFiles);
            return result;
          }
          
          // Keep track of best result
          if (!bestResult || result.confidence > bestResult.confidence) {
            if (bestResult && options.includeAlternateMatches) {
              this.alternateMatches.push(bestResult);
            }
            bestResult = result;
          } else if (options.includeAlternateMatches) {
            this.alternateMatches.push(result);
          }
        }
      }
      
      // Add alternate matches to result if requested
      if (bestResult && options.includeAlternateMatches && this.alternateMatches.length > 0) {
        bestResult.alternate_matches = this.alternateMatches.slice();
      }
      
      await this.audioProcessor.cleanup(tempFiles);
      return bestResult;
      
    } catch (error) {
      await this.audioProcessor.cleanup(tempFiles);
      throw error;
    }
  }

  /**
   * Identify track using all available services
   * @param {string|Buffer} audioData - Audio data
   * @param {Array} services - Available services
   * @param {Object} options - Recognition options
   * @returns {Promise<Object|null>} Recognition result
   */
  async identifyWithServices(audioData, services, options) {
    // Determine which services to use
    const servicesToUse = options.useAllServices ? services : [services[0]];
    
    if (servicesToUse.length === 1) {
      // Single service recognition
      const { name, service } = servicesToUse[0];
      console.log(`  • Querying ${name}...`);
      
      try {
        const result = await Promise.race([
          service.identifyTrack(audioData),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), options.timeout)
          )
        ]);
        
        if (result) {
          console.log(`  ✓ ${name} found: ${result.artist} - ${result.title}`);
          return result;
        } else {
          console.log(`  ✗ ${name} found no matches`);
        }
        
        return null;
      } catch (error) {
        console.log(`  ✗ ${name} error: ${error.message}`);
        return null;
      }
    }
    
    // Multi-service recognition with consensus
    console.log(`🔍 Running recognition with ${servicesToUse.length} services...`);

    // Run all services in parallel
    const promises = servicesToUse.map(async ({ name, service }) => {
      try {
        console.log(`  • Querying ${name}...`);
        const result = await Promise.race([
          service.identifyTrack(audioData),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), options.timeout)
          )
        ]);
        
        if (result) {
          console.log(`  ✓ ${name} found: ${result.artist} - ${result.title}`);
        } else {
          console.log(`  ✗ ${name} found no matches`);
        }
        
        return { service: name, result };
      } catch (error) {
        console.log(`  ✗ ${name} error: ${error.message}`);
        return { service: name, result: null, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    
    // Filter out null results
    const validResults = results.filter(r => r.result !== null);
    
    if (validResults.length === 0) {
      console.log('  ❌ No services found matches');
      return null;
    }

    console.log(`  📊 Got ${validResults.length} valid results`);

    // If only one result, return it
    if (validResults.length === 1) {
      return validResults[0].result;
    }

    // Cross-reference results
    return crossReferenceResults(validResults, servicesToUse.length, options.consensusThreshold);
  }

  /**
   * Identify track using a specific service
   * @param {string|Buffer} audioData - Audio data
   * @param {string} serviceName - Name of service to use ('shazam', 'audd', 'acrcloud')
   * @returns {Promise<Object|null>} Recognition result or null
   */
  async identifyWithService(audioData, serviceName) {
    const service = this.services[serviceName];
    
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }
    
    if (!service.isConfigured()) {
      throw new Error(`Service '${serviceName}' is not configured`);
    }
    
    try {
      const result = await service.identifyTrack(audioData);
      
      if (result) {
        return {
          ...result,
          services: [serviceName]
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error with ${serviceName}:`, error.message);
      return null;
    }
  }

  /**
   * Get usage statistics from all configured services
   * @returns {Promise<Object>} Usage statistics
   */
  async getUsageStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      services: {}
    };
    
    // Only AudD provides usage stats
    if (this.services.audd.isConfigured()) {
      try {
        const auddUsage = await this.services.audd.getUsage();
        if (auddUsage) {
          stats.services.audd = auddUsage;
        }
      } catch (error) {
        stats.services.audd = { error: error.message };
      }
    }
    
    return stats;
  }

  /**
   * Search for tracks by text query (using Shazam)
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of search results
   */
  async searchTracks(query) {
    if (!this.services.shazam.isConfigured()) {
      throw new Error('Shazam service is required for text search');
    }
    
    try {
      return await this.services.shazam.searchTracks(query);
    } catch (error) {
      console.error('Search error:', error.message);
      return [];
    }
  }

  /**
   * Get track details by service-specific ID
   * @param {string} trackId - Track ID
   * @param {string} service - Service name ('shazam')
   * @returns {Promise<Object|null>} Track details or null
   */
  async getTrackDetails(trackId, service = 'shazam') {
    if (service === 'shazam' && this.services.shazam.isConfigured()) {
      return await this.services.shazam.getTrackDetails(trackId);
    }
    
    throw new Error(`Track details not supported for service: ${service}`);
  }
}

module.exports = MusicRecogniser;
const { areResultsSimilar } = require('./similarity');

/**
 * Consensus and cross-reference utilities for music recognition
 */

/**
 * Group similar results based on title and artist similarity
 * @param {Array} results - Array of results from different services
 * @param {number} threshold - Similarity threshold (default: 0.8)
 * @returns {Array} Array of grouped results
 */
function groupSimilarResults(results, threshold = 0.8) {
  const groups = [];
  
  for (const result of results) {
    let addedToGroup = false;
    
    for (const group of groups) {
      if (areResultsSimilar(result.result, group[0].result, threshold)) {
        group.push(result);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      groups.push([result]);
    }
  }
  
  return groups;
}

/**
 * Calculate consensus score for a group of results
 * @param {Array} group - Group of similar results
 * @param {number} totalServices - Total number of available services
 * @returns {number} Consensus score (0-1)
 */
function calculateConsensusScore(group, totalServices) {
  const groupSize = group.length;
  
  // Base score from number of services agreeing
  const agreementScore = groupSize / totalServices;
  
  // Boost score based on individual confidence scores
  const avgConfidence = group.reduce((sum, item) => {
    return sum + (item.result.confidence || 0);
  }, 0) / groupSize;
  
  // Weighted combination: 70% agreement, 30% confidence
  return (agreementScore * 0.7) + (avgConfidence * 0.3);
}

/**
 * Merge results from a group into a single result
 * @param {Array} group - Group of similar results
 * @param {number} totalServices - Total number of available services
 * @returns {Object} Merged result
 */
function mergeResults(group, totalServices) {
  const merged = {
    services: group.map(g => g.service),
    consensus_score: calculateConsensusScore(group, totalServices),
    individual_results: group.map(g => ({
      service: g.service,
      confidence: g.result.confidence,
      title: g.result.title,
      artist: g.result.artist
    }))
  };
  
  // Use the result with highest confidence as the base
  const bestResult = group.reduce((best, current) => {
    const currentConfidence = current.result.confidence || 0;
    const bestConfidence = best.result.confidence || 0;
    return currentConfidence > bestConfidence ? current : best;
  });
  
  // Merge additional data from all services
  Object.assign(merged, bestResult.result);
  
  // Collect unique external IDs from all services
  const externalIds = {};
  group.forEach(g => {
    if (g.result.external_ids) {
      Object.assign(externalIds, g.result.external_ids);
    }
    // Legacy support for individual platform fields
    if (g.result.spotify) externalIds.spotify = g.result.spotify;
    if (g.result.apple_music) externalIds.apple_music = g.result.apple_music;
    if (g.result.deezer) externalIds.deezer = g.result.deezer;
    if (g.result.shazam_key) externalIds.shazam = g.result.shazam_key;
  });
  
  if (Object.keys(externalIds).length > 0) {
    merged.external_ids = externalIds;
  }
  
  return merged;
}

/**
 * Cross-reference results from multiple services
 * @param {Array} results - Array of results from different services
 * @param {number} totalServices - Total number of available services
 * @param {number} consensusThreshold - Minimum consensus threshold (default: 0.7)
 * @returns {Object} Best cross-referenced result
 */
function crossReferenceResults(results, totalServices, consensusThreshold = 0.7) {
  console.log('  🔄 Cross-referencing results...');
  
  // Group similar results
  const groups = groupSimilarResults(results);
  
  // Find the group with highest consensus
  let bestGroup = null;
  let bestScore = 0;
  
  for (const group of groups) {
    const consensusScore = calculateConsensusScore(group, totalServices);
    console.log(`    • Group "${group[0].result.title}" consensus: ${consensusScore.toFixed(2)}`);
    
    if (consensusScore > bestScore) {
      bestScore = consensusScore;
      bestGroup = group;
    }
  }
  
  if (bestGroup && bestScore >= consensusThreshold) {
    console.log(`  ✓ Best consensus: ${bestScore.toFixed(2)} for "${bestGroup[0].result.title}"`);
    return mergeResults(bestGroup, totalServices);
  }
  
  // If no consensus, return result with highest individual confidence
  const highestConfidenceResult = results.reduce((best, current) => {
    const currentConfidence = current.result.confidence || 0;
    const bestConfidence = best.result.confidence || 0;
    return currentConfidence > bestConfidence ? current : best;
  });
  
  console.log(`  ⚠️  No consensus reached, using highest confidence result from ${highestConfidenceResult.service}`);
  return highestConfidenceResult.result;
}

module.exports = {
  groupSimilarResults,
  calculateConsensusScore,
  mergeResults,
  crossReferenceResults
};
/**
 * Metadata Service External Links Utility
 *
 * Centralized mapping of metadata services to their external URLs.
 * Extensible - add new services here as needed.
 */

/**
 * Generate external URL for a metadata service
 * @param {string} serviceName - Name of the metadata service (case-insensitive)
 * @param {string} externalId - External ID in the metadata service
 * @returns {string|null} URL to the external service, or null if service not configured
 */
export function getMetadataServiceUrl(serviceName, externalId) {
  if (!serviceName || !externalId) return null;

  const serviceMap = {
    musicbrainz: (id) => `https://musicbrainz.org/release/${id}`,
    redacted: (id) => `https://redacted.sh/torrents.php?id=${id}`,
    // Easy to add more services, e.g.:
    // lastfm: (id) => `https://www.last.fm/music/${encodeURIComponent(id)}`,
  };

  const urlGenerator = serviceMap[serviceName.toLowerCase()];
  return urlGenerator ? urlGenerator(externalId) : null;
}

/**
 * Check if a metadata service has URL mapping configured
 * @param {string} serviceName - Name of the metadata service
 * @returns {boolean} True if service has URL mapping
 */
export function hasMetadataServiceUrl(serviceName) {
  if (!serviceName) return false;
  return getMetadataServiceUrl(serviceName, 'test') !== null;
}

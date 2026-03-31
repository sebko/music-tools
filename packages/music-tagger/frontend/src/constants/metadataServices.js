/**
 * Centralized metadata services configuration
 * Single source of truth for all metadata service references across the application
 */

// Service name constants
export const REDACTED = "redacted";
export const MUSICBRAINZ = "musicbrainz";

export const METADATA_SERVICES = [
  {
    value: REDACTED,
    title: "Redacted",
    description: "Modern music database with high-quality artwork",
  },
  {
    value: MUSICBRAINZ,
    title: "MusicBrainz",
    description: "Open music encyclopedia with comprehensive metadata",
  },
];

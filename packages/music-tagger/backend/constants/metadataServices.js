/**
 * Centralized metadata service constants for backend
 * Single source of truth for all metadata service name references
 *
 * These constants should be used instead of hardcoded strings throughout the backend.
 * This ensures type safety and makes future service name changes trivial.
 */

// Service name constants (must match database values and frontend)
export const REDACTED = "redacted";
export const MUSICBRAINZ = "musicbrainz";
export const ALLMUSIC = "allmusic";
export const LASTFM = "lastfm";
export const PLEXMUSIC = "plexmusic";

// Array of all supported services (for validation/iteration)
export const ALL_SERVICES = [REDACTED, MUSICBRAINZ, ALLMUSIC, LASTFM, PLEXMUSIC];

// Service display names (for logging/UI responses)
export const SERVICE_DISPLAY_NAMES = {
  [REDACTED]: "Redacted",
  [MUSICBRAINZ]: "MusicBrainz",
  [ALLMUSIC]: "AllMusic",
  [LASTFM]: "Last.fm",
  [PLEXMUSIC]: "Plex Music",
};

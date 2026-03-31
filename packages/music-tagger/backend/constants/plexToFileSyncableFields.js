/**
 * Backend source of truth for implemented Plex-to-file syncable fields
 * Keep in sync with frontend/src/constants/plexToFileSyncableFields.js
 *
 * Only fields that are actually implemented (can be synced) should be listed here.
 * This is used to determine if an album has "complete" or "incomplete" sync status.
 */

export const IMPLEMENTED_PLEX_TO_FILE_FIELDS = ["genre", "title", "artist", "year", "studio", "artwork"];

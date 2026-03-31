/**
 * Syncable fields configuration for Plex → Local File sync
 * Single source of truth for metadata fields that can be synced from Plex to ID3/Vorbis tags
 *
 * Used by:
 * - SyncToFilesPage.jsx
 * - SyncToFilesFieldsModal.jsx
 */

export const PLEX_TO_FILE_SYNCABLE_FIELDS = [
  {
    key: "genre",
    label: "Genre",
    description: "Genres + styles merged into GENRE tag",
    plexFields: ["genres", "styles"],
    defaultEnabled: true,
    implemented: true,
  },
  {
    key: "title",
    label: "Album Title",
    description: "Album name",
    plexFields: ["title"],
    defaultEnabled: false,
    implemented: true,
  },
  {
    key: "artist",
    label: "Album Artist",
    description: "Album artist (ALBUMARTIST tag)",
    plexFields: ["artist"],
    defaultEnabled: false,
    implemented: true,
  },
  {
    key: "year",
    label: "Year",
    description: "Release year",
    plexFields: ["year"],
    defaultEnabled: false,
    implemented: true,
  },
  {
    key: "studio",
    label: "Label",
    description: "Record label (LABEL/PUBLISHER tag)",
    plexFields: ["studio"],
    defaultEnabled: false,
    implemented: true,
  },
  {
    key: "artwork",
    label: "Artwork",
    description: "Embedded album artwork",
    plexFields: ["artworkUrl"],
    defaultEnabled: false,
    implemented: true,
  },
];

/**
 * Get default field selection state object
 * Returns an object with field keys and their default enabled state
 * Only includes implemented fields as enabled by default
 */
export function getDefaultPlexToFileFieldSelection() {
  return PLEX_TO_FILE_SYNCABLE_FIELDS.reduce((acc, field) => {
    // Only set true if both defaultEnabled AND implemented
    acc[field.key] = field.defaultEnabled && field.implemented;
    return acc;
  }, {});
}

/**
 * Get field labels map for display messages
 */
export const PLEX_TO_FILE_FIELD_LABELS = PLEX_TO_FILE_SYNCABLE_FIELDS.reduce(
  (acc, field) => {
    acc[field.key] = field.label;
    return acc;
  },
  {}
);

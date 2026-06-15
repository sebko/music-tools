/**
 * Centralized syncable fields configuration
 * Single source of truth for all metadata fields that can be synced to Plex
 *
 * Used by:
 * - SyncMetadataPage.jsx (individual album sync)
 * - BulkSyncFieldsModal.jsx (bulk sync field selection)
 */

export const SYNCABLE_FIELDS = [
  {
    key: "coverUrl",
    label: "Artwork",
    description: "Album cover image",
    defaultEnabled: false,
  },
  {
    key: "title",
    label: "Album Title",
    description: "Album name",
    defaultEnabled: false,
  },
  {
    key: "year",
    label: "Year",
    description: "Release year",
    defaultEnabled: false,
  },
  {
    key: "tags",
    label: "Styles",
    description: "Genre/style tags",
    defaultEnabled: false,
  },
  {
    key: "label",
    label: "Label",
    description: "Record label",
    defaultEnabled: false,
  },
];

/**
 * Get default field selection state object
 * Returns an object with field keys as keys and defaultEnabled as values
 */
export function getDefaultFieldSelection() {
  return SYNCABLE_FIELDS.reduce((acc, field) => {
    acc[field.key] = field.defaultEnabled;
    return acc;
  }, {});
}

/**
 * Get field labels map for display messages
 */
export const FIELD_LABELS = SYNCABLE_FIELDS.reduce((acc, field) => {
  acc[field.key] = field.label;
  return acc;
}, {});

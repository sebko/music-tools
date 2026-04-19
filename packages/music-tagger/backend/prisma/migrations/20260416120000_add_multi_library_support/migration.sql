-- Multi-library support migration
-- Adds library_name column to all scoped tables
-- Renames plex_settings.library_name to active_library_name
-- Adds available_libraries to plex_settings
-- Updates unique constraints for multi-library support

-- Add library_name to scoped tables
ALTER TABLE "album_metadata_service_matches" ADD COLUMN "library_name" TEXT NOT NULL DEFAULT 'Music';
ALTER TABLE "plex_file_syncs" ADD COLUMN "library_name" TEXT NOT NULL DEFAULT 'Music';
ALTER TABLE "redacted_plex_syncs" ADD COLUMN "library_name" TEXT NOT NULL DEFAULT 'Music';
ALTER TABLE "sync_failures" ADD COLUMN "library_name" TEXT NOT NULL DEFAULT 'Music';

-- Recreate albums table with composite unique constraint and library_name
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_albums" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plex_rating_key" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "year" INTEGER,
    "added_at" DATETIME,
    "title_sort" TEXT,
    "genre" TEXT,
    "folder_created_at" DATETIME,
    "artwork_width" INTEGER,
    "artwork_height" INTEGER,
    "match_status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "synced_at" DATETIME,
    "library_name" TEXT NOT NULL DEFAULT 'Music',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "new_albums" ("id", "plex_rating_key", "file_path", "title", "artist", "year", "added_at", "title_sort", "genre", "folder_created_at", "artwork_width", "artwork_height", "match_status", "synced_at", "library_name", "created_at", "updated_at")
    SELECT "id", "plex_rating_key", "file_path", "title", "artist", "year", "added_at", "title_sort", "genre", "folder_created_at", "artwork_width", "artwork_height", "match_status", "synced_at", 'Music', "created_at", "updated_at" FROM "albums";

DROP TABLE "albums";
ALTER TABLE "new_albums" RENAME TO "albums";

-- Create composite unique constraint and indexes
CREATE UNIQUE INDEX "albums_plex_rating_key_library_name_key" ON "albums"("plex_rating_key", "library_name");
CREATE INDEX "albums_library_name_idx" ON "albums"("library_name");
CREATE INDEX "albums_library_name_match_status_idx" ON "albums"("library_name", "match_status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Recreate plex_settings with renamed column and new field
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_plex_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "token" TEXT,
    "server_name" TEXT,
    "active_library_name" TEXT,
    "available_libraries" TEXT DEFAULT '[]',
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "new_plex_settings" ("id", "token", "server_name", "active_library_name", "available_libraries", "updated_at")
    SELECT "id", "token", "server_name", "library_name", '[]', "updated_at" FROM "plex_settings";

DROP TABLE "plex_settings";
ALTER TABLE "new_plex_settings" RENAME TO "plex_settings";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

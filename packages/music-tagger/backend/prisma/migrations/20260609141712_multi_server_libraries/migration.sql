/*
  Warnings:

  - You are about to drop the `plex_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `library_name` on the `album_metadata_service_matches` table. All the data in the column will be lost.
  - You are about to drop the column `library_name` on the `albums` table. All the data in the column will be lost.
  - You are about to drop the column `library_name` on the `plex_file_syncs` table. All the data in the column will be lost.
  - You are about to drop the column `library_name` on the `redacted_plex_syncs` table. All the data in the column will be lost.
  - You are about to drop the column `library_name` on the `sync_failures` table. All the data in the column will be lost.
  - Added the required column `library_id` to the `albums` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "plex_settings";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "plex_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auth_token" TEXT NOT NULL,
    "username" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "plex_servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT NOT NULL,
    "machine_identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_connected_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "plex_servers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "plex_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "plex_libraries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "server_id" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'artist',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "plex_libraries_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "plex_servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "active_library_id" TEXT,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "app_settings_active_library_id_fkey" FOREIGN KEY ("active_library_id") REFERENCES "plex_libraries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_album_metadata_service_matches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "metadata_service_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "album_metadata_service_matches_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "album_metadata_service_matches_metadata_service_id_fkey" FOREIGN KEY ("metadata_service_id") REFERENCES "metadata_services" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_album_metadata_service_matches" ("album_id", "created_at", "external_id", "id", "metadata_service_id") SELECT "album_id", "created_at", "external_id", "id", "metadata_service_id" FROM "album_metadata_service_matches";
DROP TABLE "album_metadata_service_matches";
ALTER TABLE "new_album_metadata_service_matches" RENAME TO "album_metadata_service_matches";
CREATE UNIQUE INDEX "album_metadata_service_matches_album_id_metadata_service_id_external_id_key" ON "album_metadata_service_matches"("album_id", "metadata_service_id", "external_id");
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
    "library_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "albums_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "plex_libraries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_albums" ("added_at", "artist", "artwork_height", "artwork_width", "created_at", "file_path", "folder_created_at", "genre", "id", "match_status", "plex_rating_key", "synced_at", "title", "title_sort", "updated_at", "year") SELECT "added_at", "artist", "artwork_height", "artwork_width", "created_at", "file_path", "folder_created_at", "genre", "id", "match_status", "plex_rating_key", "synced_at", "title", "title_sort", "updated_at", "year" FROM "albums";
DROP TABLE "albums";
ALTER TABLE "new_albums" RENAME TO "albums";
CREATE INDEX "albums_library_id_idx" ON "albums"("library_id");
CREATE INDEX "albums_library_id_match_status_idx" ON "albums"("library_id", "match_status");
CREATE UNIQUE INDEX "albums_library_id_plex_rating_key_key" ON "albums"("library_id", "plex_rating_key");
CREATE TABLE "new_plex_file_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "synced_fields" TEXT NOT NULL DEFAULT '{}',
    "last_synced_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plex_file_syncs_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_plex_file_syncs" ("album_id", "created_at", "id", "last_synced_at", "synced_fields") SELECT "album_id", "created_at", "id", "last_synced_at", "synced_fields" FROM "plex_file_syncs";
DROP TABLE "plex_file_syncs";
ALTER TABLE "new_plex_file_syncs" RENAME TO "plex_file_syncs";
CREATE UNIQUE INDEX "plex_file_syncs_album_id_key" ON "plex_file_syncs"("album_id");
CREATE TABLE "new_redacted_plex_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "synced_fields" TEXT NOT NULL DEFAULT '{}',
    "last_synced_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "redacted_plex_syncs_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_redacted_plex_syncs" ("album_id", "created_at", "id", "last_synced_at", "synced_fields") SELECT "album_id", "created_at", "id", "last_synced_at", "synced_fields" FROM "redacted_plex_syncs";
DROP TABLE "redacted_plex_syncs";
ALTER TABLE "new_redacted_plex_syncs" RENAME TO "redacted_plex_syncs";
CREATE UNIQUE INDEX "redacted_plex_syncs_album_id_key" ON "redacted_plex_syncs"("album_id");
CREATE TABLE "new_sync_failures" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "details" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_failures_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_sync_failures" ("album_id", "created_at", "details", "error", "id", "operation") SELECT "album_id", "created_at", "details", "error", "id", "operation" FROM "sync_failures";
DROP TABLE "sync_failures";
ALTER TABLE "new_sync_failures" RENAME TO "sync_failures";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "plex_servers_machine_identifier_key" ON "plex_servers"("machine_identifier");

-- CreateIndex
CREATE INDEX "plex_libraries_server_id_idx" ON "plex_libraries"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "plex_libraries_server_id_section_key_key" ON "plex_libraries"("server_id", "section_key");

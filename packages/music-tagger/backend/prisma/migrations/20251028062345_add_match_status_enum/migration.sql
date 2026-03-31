/*
  Warnings:

  - You are about to drop the `discogs_releases` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `musictracker_releases` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "discogs_releases_discogs_id_key";

-- DropIndex
DROP INDEX "musictracker_releases_musictracker_id_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "discogs_releases";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "musictracker_releases";
PRAGMA foreign_keys=on;

-- RedefineTables
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
    "match_status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "minted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_albums" ("added_at", "artist", "created_at", "file_path", "folder_created_at", "genre", "id", "plex_rating_key", "title", "title_sort", "updated_at", "year") SELECT "added_at", "artist", "created_at", "file_path", "folder_created_at", "genre", "id", "plex_rating_key", "title", "title_sort", "updated_at", "year" FROM "albums";
DROP TABLE "albums";
ALTER TABLE "new_albums" RENAME TO "albums";
CREATE UNIQUE INDEX "albums_plex_rating_key_key" ON "albums"("plex_rating_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

/*
  Warnings:

  - You are about to drop the column `password` on the `plex_settings` table. All the data in the column will be lost.
  - You are about to drop the column `server_url` on the `plex_settings` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `plex_settings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_plex_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "token" TEXT,
    "server_name" TEXT,
    "library_name" TEXT,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_plex_settings" ("id", "library_name", "server_name", "token", "updated_at") SELECT "id", "library_name", "server_name", "token", "updated_at" FROM "plex_settings";
DROP TABLE "plex_settings";
ALTER TABLE "new_plex_settings" RENAME TO "plex_settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

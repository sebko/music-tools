-- CreateTable
CREATE TABLE "plex_file_syncs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "synced_fields" TEXT NOT NULL DEFAULT '{}',
    "last_synced_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plex_file_syncs_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "plex_file_syncs_album_id_key" ON "plex_file_syncs"("album_id");

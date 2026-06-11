-- CreateTable
CREATE TABLE "favourite_swipes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_library_id" TEXT NOT NULL,
    "destination_library_id" TEXT NOT NULL,
    "rating_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "location" TEXT,
    "decision" TEXT NOT NULL,
    "copy_status" TEXT,
    "copy_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "favourite_swipes_source_library_id_fkey" FOREIGN KEY ("source_library_id") REFERENCES "plex_libraries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "favourite_swipes_destination_library_id_fkey" FOREIGN KEY ("destination_library_id") REFERENCES "plex_libraries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "favourite_swipes_source_library_id_destination_library_id_decision_idx" ON "favourite_swipes"("source_library_id", "destination_library_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_swipes_source_library_id_destination_library_id_rating_key_key" ON "favourite_swipes"("source_library_id", "destination_library_id", "rating_key");


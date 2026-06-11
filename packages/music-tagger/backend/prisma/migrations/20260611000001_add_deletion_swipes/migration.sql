-- CreateTable
CREATE TABLE "deletion_swipes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "library_id" TEXT NOT NULL,
    "rating_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "location" TEXT,
    "decision" TEXT NOT NULL,
    "delete_status" TEXT,
    "delete_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deletion_swipes_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "plex_libraries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "deletion_swipes_library_id_decision_idx" ON "deletion_swipes"("library_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_swipes_library_id_rating_key_key" ON "deletion_swipes"("library_id", "rating_key");


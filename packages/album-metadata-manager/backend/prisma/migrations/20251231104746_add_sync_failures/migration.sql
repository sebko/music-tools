-- CreateTable
CREATE TABLE "sync_failures" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "details" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_failures_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

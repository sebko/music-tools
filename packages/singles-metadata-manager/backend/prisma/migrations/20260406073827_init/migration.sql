-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_path" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "album_artist" TEXT,
    "album" TEXT,
    "year" INTEGER,
    "genre" TEXT,
    "track_count" INTEGER,
    "duration" REAL,
    "format" TEXT,
    "has_embedded_artwork" BOOLEAN NOT NULL DEFAULT false,
    "artwork_format" TEXT,
    "bitrate" INTEGER,
    "sample_rate" INTEGER,
    "channels" INTEGER,
    "label" TEXT,
    "comment" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "albums_file_path_key" ON "albums"("file_path");

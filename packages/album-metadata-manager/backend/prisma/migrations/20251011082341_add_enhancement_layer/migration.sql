-- CreateTable
CREATE TABLE "discogs_releases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discogs_id" TEXT NOT NULL,
    "discogs_master_id" TEXT,
    "title" TEXT,
    "artist" TEXT,
    "year" INTEGER,
    "genre" TEXT,
    "track_count" INTEGER,
    "country" TEXT,
    "format" TEXT,
    "raw_response" TEXT,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "musictracker_releases" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "musictracker_id" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "year" INTEGER,
    "genre" TEXT,
    "track_count" INTEGER,
    "raw_response" TEXT,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plex_rating_key" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "metadata_services" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "album_metadata_service_matches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "album_id" TEXT NOT NULL,
    "metadata_service_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "album_metadata_service_matches_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "albums" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "album_metadata_service_matches_metadata_service_id_fkey" FOREIGN KEY ("metadata_service_id") REFERENCES "metadata_services" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "discogs_releases_discogs_id_key" ON "discogs_releases"("discogs_id");

-- CreateIndex
CREATE UNIQUE INDEX "musictracker_releases_musictracker_id_key" ON "musictracker_releases"("musictracker_id");

-- CreateIndex
CREATE UNIQUE INDEX "metadata_services_name_key" ON "metadata_services"("name");

-- CreateIndex
CREATE UNIQUE INDEX "album_metadata_service_matches_album_id_metadata_service_id_external_id_key" ON "album_metadata_service_matches"("album_id", "metadata_service_id", "external_id");

-- CreateTable
CREATE TABLE "plex_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "server_url" TEXT,
    "username" TEXT,
    "password" TEXT,
    "token" TEXT,
    "server_name" TEXT,
    "library_name" TEXT,
    "updated_at" DATETIME NOT NULL
);

/**
 * Plex Client - Integration with local Plex Media Server
 *
 * This service connects to a local Plex server to retrieve music library data.
 * Requires PLEX_USERNAME and PLEX_PASSWORD environment variables.
 */

import { MyPlexAccount, Album } from "@ctrl/plex";
import { prisma } from "../prisma/client.js";

// Configuration - read dynamically to support test environment overrides
let plexServer = null;
let musicSection = null;

// Auth token caching to prevent rate limiting
let cachedAuthToken = null;
let authTokenExpiry = null;
let authInProgress = null;

// Full initialization promise (auth + server connect + section lookup)
let initInProgress = null;

/**
 * Get Plex configuration from DB (preferred) or fall back to env vars
 */
async function getPlexConfig() {
  try {
    const dbSettings = await prisma.plexSettings.findUnique({ where: { id: "singleton" } });
    if (dbSettings?.token) {
      return {
        token: dbSettings.token,
        serverName: dbSettings.serverName,
        libraryName: dbSettings.libraryName,
      };
    }
  } catch (err) {
    console.log("  ⚠️  Could not read Plex settings from DB, falling back to env vars:", err.message);
  }
  // Fall back to env vars (legacy support)
  return {
    serverUrl: process.env.PLEX_URL || "http://localhost:32400",
    username: process.env.PLEX_USERNAME,
    password: process.env.PLEX_PASSWORD,
    serverName: process.env.PLEX_SERVER_NAME,
    libraryName: process.env.PLEX_LIBRARY_NAME,
  };
}

/**
 * Clear all module-level Plex cache so new settings take effect
 */
export function clearPlexCache() {
  plexServer = null;
  musicSection = null;
  cachedAuthToken = null;
  authTokenExpiry = null;
  authInProgress = null;
  initInProgress = null;
  console.log("🔄 Plex cache cleared");
}

/**
 * Authenticate to Plex using OAuth token or legacy username/password
 * @param {Object} config - Plex config from getPlexConfig()
 * @returns {Promise<MyPlexAccount>} Authenticated account
 */
async function authenticateToPlex(config) {
  const now = Date.now();

  // Check if we have a valid in-memory cached token
  if (cachedAuthToken && (!authTokenExpiry || now < authTokenExpiry)) {
    console.log(`  📦 Using cached auth token`);
    try {
      const account = await new MyPlexAccount(null, '', '', cachedAuthToken).connect();
      return account;
    } catch (error) {
      console.log(`  ⚠️  Cached token failed, re-authenticating: ${error.message}`);
      cachedAuthToken = null;
      authTokenExpiry = null;
    }
  }

  // OAuth token-based auth (from Settings page)
  if (config.token) {
    console.log(`  🔑 Authenticating with OAuth token...`);
    const account = await new MyPlexAccount(null, '', '', config.token).connect();
    cachedAuthToken = account.authenticationToken;
    authTokenExpiry = now + 24 * 60 * 60 * 1000; // 24 hours
    console.log(`  ✅ Authenticated with OAuth token`);
    return account;
  }

  // Legacy env-var username/password auth
  const plexUrl = config.serverUrl || "http://localhost:32400";
  console.log(`  🔑 Authenticating with username/password...`);
  const account = await new MyPlexAccount(plexUrl, config.username, config.password).connect();
  cachedAuthToken = account.authenticationToken;
  authTokenExpiry = now + 24 * 60 * 60 * 1000; // 24 hours
  console.log(`  ✅ Cached new auth token (expires in 24h)`);
  return account;
}

/**
 * Initialize Plex connection and get music library section
 * @returns {Promise<MusicSection>} Initialized music section
 */
async function getMusicSection() {
  const config = await getPlexConfig();
  const PLEX_SERVER_NAME = config.serverName;
  const PLEX_LIBRARY_NAME = config.libraryName;

  if (!config.token && (!config.username || !config.password)) {
    throw new Error("Plex not configured. Please sign in with Plex in Settings.");
  }

  // Return cached section if already initialized
  if (musicSection) {
    return musicSection;
  }

  // If full initialization is already in progress, wait for it to complete
  if (initInProgress) {
    console.log(`  ⏳ Plex initialization in progress, waiting...`);
    return await initInProgress;
  }

  console.log(`🔌 Connecting to Plex...`);

  // Track the full initialization so concurrent callers wait for the real result
  initInProgress = (async () => {
  try {
    // Start authentication and track it to prevent concurrent auth attempts
    authInProgress = authenticateToPlex(config);
    const account = await authInProgress;
    authInProgress = null;

    console.log(`✅ Connected to Plex account successfully`);

    // Get local server resource
    const resources = await account.resources();
    let localServer;

    if (PLEX_SERVER_NAME) {
      // Find server by name if specified
      localServer = resources.find(
        r => r.provides === "server" && r.presence && r.name === PLEX_SERVER_NAME
      );

      if (!localServer) {
        const availableServers = resources
          .filter(r => r.provides === "server" && r.presence)
          .map(r => r.name)
          .join(", ");
        throw new Error(
          `Plex server "${PLEX_SERVER_NAME}" not found. Available servers: ${availableServers || "none"}`
        );
      }

      console.log(`📡 Found Plex server: "${localServer.name}" (selected by PLEX_SERVER_NAME)`);
    } else {
      // Use first available server if no name specified
      localServer = resources.find(r => r.provides === "server" && r.presence);

      if (!localServer) {
        throw new Error("No local Plex server found. Make sure your Plex Media Server is running.");
      }

      console.log(`📡 Found Plex server: "${localServer.name}" (first available)`);
    }

    // Connect to the server
    plexServer = await localServer.connect();
    console.log(`✅ Connected to Plex server successfully`);

    // Get library and find music section
    const library = await plexServer.library();
    const sections = await library.sections();

    // Find music section by name if specified, otherwise use first
    let musicSectionData;
    if (PLEX_LIBRARY_NAME) {
      musicSectionData = sections.find(
        section => section.type === "artist" && section.title === PLEX_LIBRARY_NAME
      );

      if (!musicSectionData) {
        const availableLibraries = sections
          .filter(s => s.type === "artist")
          .map(s => s.title)
          .join(", ");
        throw new Error(
          `Plex library "${PLEX_LIBRARY_NAME}" not found. Available music libraries: ${availableLibraries || "none"}`
        );
      }

      console.log(
        `🎵 Found music library: "${musicSectionData.title}" (selected by PLEX_LIBRARY_NAME)`
      );
    } else {
      // Find the first music section (type = 'artist')
      musicSectionData = sections.find(section => section.type === "artist");

      if (!musicSectionData) {
        throw new Error(
          "No music library found in Plex. Please add a music library to your Plex server."
        );
      }

      console.log(`🎵 Found music library: "${musicSectionData.title}" (first available)`);
    }

    // Get the full music section object
    musicSection = await library.section(musicSectionData.title);

    return musicSection;
  } catch (error) {
    console.error("Failed to connect to Plex:", error);
    initInProgress = null; // Clear so next attempt can retry
    throw new Error(`Plex connection failed: ${error.message}`);
  } finally {
    // Clear initInProgress once done (success or failure handled above)
    if (initInProgress) initInProgress = null;
  }
  })();

  return await initInProgress;
}

/**
 * Get the Plex server instance (ensures connection is established)
 * This is the single source of truth for Plex server connection.
 * @returns {Promise<PlexServer>} Connected Plex server
 */
export async function getPlexServer() {
  await getMusicSection(); // Establishes connection and caches plexServer
  return plexServer;
}

/**
 * Get albums from Plex with optional filters
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.limit - Items per page
 * @param {boolean} options.unmatched - Only show unmatched albums
 * @param {boolean} options.matched - Only show matched albums
 * @param {string} options.genre - Filter by genre
 * @param {number} options.addedAfter - Unix timestamp for addedAt filter
 * @param {number} options.updatedAfter - Unix timestamp for updatedAt filter
 * @param {string} options.sort - Sort field (addedAt, titleSort, originallyAvailableAt, year, rating)
 * @param {string} options.sortDirection - Sort direction (asc or desc)
 * @returns {Promise<Object>} Albums with pagination info
 */
export async function getPlexAlbums(options = {}) {
  const {
    page = 1,
    limit = 50,
    unmatched = null,
    matched = null,
    genre = null,
    addedAfter = null,
    updatedAfter = null,
    sort = null,
    sortDirection = "desc",
  } = options;

  try {
    const section = await getMusicSection();

    // Build search filters
    const searchArgs = {};

    if (unmatched === true) {
      searchArgs.unmatched = true;
    } else if (matched === true) {
      searchArgs.unmatched = false;
    }

    if (genre) {
      searchArgs["genre"] = genre;
    }

    // Note: Date filtering might require raw query approach
    // For now, we'll get all albums and filter in memory if needed

    console.log(`📡 Querying Plex for albums...`);

    // Use raw Plex API query instead of section.search() to get proper album artwork
    const params = new URLSearchParams({
      type: "9", // Type 9 = albums
    });

    // Add filters
    if (unmatched === true) {
      params.append("unmatched", "1");
    } else if (matched === true) {
      params.append("unmatched", "0");
    }

    if (genre) {
      params.append("genre", genre);
    }

    // Add sorting
    if (sort) {
      const sortParam = `${sort}:${sortDirection}`;
      params.append("sort", sortParam);
    }

    const url = `/library/sections/${musicSection.key}/all?${params.toString()}`;
    const response = await plexServer.query(url);
    const allAlbums = response.MediaContainer?.Metadata || [];

    // Apply date filters if needed (client-side filtering)
    let filteredAlbums = allAlbums;

    if (addedAfter) {
      const addedAfterDate = new Date(addedAfter * 1000);
      filteredAlbums = filteredAlbums.filter(
        album => album.addedAt && album.addedAt >= addedAfterDate
      );
    }

    if (updatedAfter) {
      const updatedAfterDate = new Date(updatedAfter * 1000);
      filteredAlbums = filteredAlbums.filter(
        album => album.updatedAt && album.updatedAt >= updatedAfterDate
      );
    }

    // Apply pagination
    const totalSize = filteredAlbums.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedAlbums = filteredAlbums.slice(startIndex, endIndex);

    const totalPages = Math.ceil(totalSize / limit);

    console.log(
      `✅ Retrieved ${paginatedAlbums.length} albums (page ${page}/${totalPages}, total: ${totalSize})`
    );

    // Transform Plex albums to our format
    const transformedAlbums = paginatedAlbums.map(album => {
      // Raw Plex API returns metadata objects with direct properties
      // Note: Artist names will be "Unknown Artist" for now (deferred fix)
      const artistName = album.parentTitle || "Unknown Artist";

      // Handle date conversion (raw API returns Unix timestamps)
      const addedAt = album.addedAt ? new Date(album.addedAt * 1000).toISOString() : null;
      const updatedAt = album.updatedAt ? new Date(album.updatedAt * 1000).toISOString() : null;

      // Handle genres (raw API uses Genre array with capitalized property names)
      const genres = album.Genre?.map(g => g.tag).join(", ") || "";

      // Convert relative artwork path to full URL with auth token
      const artworkUrl = album.thumb ? plexServer.url(album.thumb, true).toString() : null;

      return {
        id: album.ratingKey,
        title: album.title,
        artist: artistName,
        artistId: album.parentRatingKey,
        year: album.year,
        addedAt,
        updatedAt,
        trackCount: album.leafCount,
        genre: genres,
        artworkUrl, // Full URL with Plex server and auth token
        hasArtwork: !!album.thumb, // Frontend expects this boolean field
        matched: !album.Guid?.some(g => g.id === "plex://album/..."),
        musicbrainzId: album.Guid?.find(g => g.id.includes("musicbrainz://"))?.id.replace(
          "musicbrainz://album/",
          ""
        ),
        location: album.Location?.[0]?.path || null, // Album directory path for hashing
        guids: album.Guid || [], // Array of GUID objects for metadata service matching
      };
    });

    return {
      albums: transformedAlbums,
      pagination: {
        page,
        limit,
        total: totalSize,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    console.error("Error fetching albums from Plex:", error);
    throw new Error(`Failed to fetch albums: ${error.message}`);
  }
}

/**
 * Get a single album by ID with full track information
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<Object|null>} Album with tracks or null
 */
export async function getPlexAlbum(albumId) {
  try {
    await getMusicSection(); // Ensure connection is established

    console.log(`📡 Fetching album: ${albumId}`);

    // Use raw Plex API to get album metadata with proper artwork
    const albumResponse = await plexServer.query(`/library/metadata/${albumId}`);
    const album = albumResponse.MediaContainer?.Metadata?.[0];

    if (!album) {
      return null;
    }

    // Get tracks for this album
    const tracksResponse = await plexServer.query(`/library/metadata/${albumId}/children`);
    const tracks = tracksResponse.MediaContainer?.Metadata || [];

    // Convert dates from Unix timestamps
    const addedAt = album.addedAt ? new Date(album.addedAt * 1000).toISOString() : null;
    const updatedAt = album.updatedAt ? new Date(album.updatedAt * 1000).toISOString() : null;

    // Convert relative artwork path to full URL with auth token
    const artworkUrl = album.thumb ? plexServer.url(album.thumb, true).toString() : null;

    // Extract array fields
    const genres = album.Genre?.map(g => g.tag) || [];
    const styles = album.Style?.map(s => s.tag) || [];
    const moods = album.Mood?.map(m => m.tag) || [];
    const formats = album.Format?.map(f => f.tag) || [];
    const images = album.Image || [];
    const guids = album.Guid || [];

    // Extract album location from first track's file path
    let location = null;
    if (tracks.length > 0) {
      const firstTrackPath = tracks[0].Media?.[0]?.Part?.[0]?.file;
      if (firstTrackPath) {
        location = firstTrackPath.substring(0, firstTrackPath.lastIndexOf("/"));
      }
    }

    // Transform album data with ALL Plex fields
    const transformedAlbum = {
      // Core identification
      id: album.ratingKey,
      key: album.key,
      guid: album.guid,
      type: album.type,

      // Title and artist
      title: album.title,
      artist: album.parentTitle || "Unknown Artist",
      artistId: album.parentRatingKey,
      parentKey: album.parentKey,
      parentGuid: album.parentGuid,

      // Library info
      librarySectionTitle: album.librarySectionTitle,
      librarySectionID: album.librarySectionID,
      librarySectionKey: album.librarySectionKey,

      // Album details
      year: album.year,
      originallyAvailableAt: album.originallyAvailableAt,
      studio: album.studio,
      summary: album.summary,
      index: album.index,
      rating: album.rating,

      // Counts
      trackCount: album.leafCount,
      viewedLeafCount: album.viewedLeafCount,

      // Dates
      addedAt,
      updatedAt,

      // Artwork URLs
      artworkUrl, // Primary album artwork (full resolution)
      hasArtwork: !!album.thumb,

      // Colors
      ultraBlurColors: album.UltraBlurColors,

      // Arrays of metadata
      genres, // Array of genre strings
      styles, // Array of style strings
      moods, // Array of mood strings
      formats, // Array of format strings
      images, // Array of image objects
      guids, // Array of GUID objects

      // Match status
      matched: !album.Guid?.some(g => g.id === "plex://album/..."),
      musicbrainzId: album.Guid?.find(g => g.id.includes("musicbrainz://"))
        ?.id.replace(/^mbid:\/\//, "")
        .replace(/^musicbrainz:\/\/album\//, ""),

      // File location
      location, // Album directory path derived from first track

      // Tracks
      tracks: tracks.map(track => ({
        id: track.ratingKey,
        title: track.title,
        trackNumber: track.index,
        duration: track.duration,
        artist: track.originalTitle || track.grandparentTitle,
      })),
    };

    console.log(
      `✅ Retrieved album "${transformedAlbum.title}" with ${transformedAlbum.tracks.length} tracks`
    );

    return transformedAlbum;
  } catch (error) {
    console.error(`Error fetching album ${albumId} from Plex:`, error);
    throw new Error(`Failed to fetch album: ${error.message}`);
  }
}

/**
 * Get album artwork URLs (thumbnail and full resolution)
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<{thumbUrl: string|null, fullUrl: string|null}>} Artwork URLs
 */
export async function getPlexAlbumArtworkUrls(albumId) {
  try {
    await getMusicSection(); // Ensure connection is established

    // Make lightweight query to get just the album metadata (no tracks)
    const albumResponse = await plexServer.query(`/library/metadata/${albumId}`);
    const album = albumResponse.MediaContainer?.Metadata?.[0];

    if (!album || !album.thumb) {
      return { thumbUrl: null, fullUrl: null };
    }

    // Get full resolution artwork URL (no compression)
    const fullUrl = plexServer.url(album.thumb, true).toString();

    // Get thumbnail URL (500x500) for Retina/high-DPI displays
    // 500x500 covers 2x displays nicely (250px CSS @ 2x = 500px actual)
    // We need to manually construct this because plexServer.url() strips query params
    const baseFullUrl = plexServer.url(album.thumb, true).toString();
    const urlObj = new URL(baseFullUrl);
    const token = urlObj.searchParams.get("X-Plex-Token");
    const thumbUrl = `${urlObj.origin}/photo/:/transcode?width=500&height=500&minSize=1&upscale=0&url=${album.thumb}&X-Plex-Token=${token}`;

    return {
      thumbUrl,
      fullUrl,
      genres: album.Genre?.map(g => g.tag) || [],
      styles: album.Style?.map(s => s.tag) || [],
    };
  } catch (error) {
    console.error(`Error fetching artwork URLs for album ${albumId}:`, error);
    return { thumbUrl: null, fullUrl: null, genres: [], styles: [] };
  }
}

/**
 * Get all available genres from the music library
 * @returns {Promise<string[]>} List of genres
 */
export async function getPlexGenres() {
  try {
    const section = await getMusicSection();
    const genres = await section.genres();
    return genres.map(genre => genre.title || genre.tag).sort();
  } catch (error) {
    console.error("Error fetching genres from Plex:", error);
    throw new Error(`Failed to fetch genres: ${error.message}`);
  }
}

/**
 * Get album directory from track file paths
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<string|null>} Album directory path or null
 */
export async function getAlbumLocation(albumId) {
  try {
    await getMusicSection(); // Ensure connection is established

    // Get tracks for this album
    const tracksResponse = await plexServer.query(`/library/metadata/${albumId}/children`);
    const tracks = tracksResponse.MediaContainer?.Metadata || [];

    if (tracks.length === 0) {
      return null;
    }

    // Get first track's file path
    const firstTrack = tracks[0];
    const filePath = firstTrack.Media?.[0]?.Part?.[0]?.file;

    if (!filePath) {
      return null;
    }

    // Extract album directory from track file path
    const albumDir = filePath.substring(0, filePath.lastIndexOf("/"));
    return albumDir;
  } catch (error) {
    console.error(`Error getting album location for ${albumId}:`, error);
    return null;
  }
}

/**
 * Update the addedAt timestamp for a Plex album
 * @param {string} albumId - Plex album rating key
 * @param {number} unixTimestamp - Unix timestamp (seconds) to set as addedAt
 * @returns {Promise<Object>} Result with before/after values
 */
export async function updatePlexAlbumAddedAt(albumId, unixTimestamp) {
  await getMusicSection();

  // Get current addedAt value
  const albumResponse = await plexServer.query(`/library/metadata/${albumId}`);
  const album = albumResponse.MediaContainer?.Metadata?.[0];

  if (!album) {
    throw new Error(`Album ${albumId} not found in Plex`);
  }

  const beforeAddedAt = album.addedAt;

  console.log(`📅 Updating addedAt for album "${album.title}" (${albumId})`);
  console.log(`   Before: ${beforeAddedAt} (${new Date(beforeAddedAt * 1000).toISOString()})`);
  console.log(`   After:  ${unixTimestamp} (${new Date(unixTimestamp * 1000).toISOString()})`);

  // Send PUT request to update addedAt
  const params = new URLSearchParams({
    "addedAt.value": String(unixTimestamp),
  });
  const url = `/library/metadata/${albumId}?${params.toString()}`;
  await plexServer.query(url, "PUT");

  console.log(`   ✅ addedAt updated successfully`);

  return {
    albumId,
    title: album.title,
    artist: album.parentTitle,
    beforeAddedAt,
    beforeAddedAtISO: new Date(beforeAddedAt * 1000).toISOString(),
    afterAddedAt: unixTimestamp,
    afterAddedAtISO: new Date(unixTimestamp * 1000).toISOString(),
  };
}

/**
 * Test Plex connection and return server info
 * @returns {Promise<Object>} Server connection info
 */
export async function testPlexConnection() {
  try {
    // Test connection using cached credentials (don't clear cache)
    const section = await getMusicSection();

    // Get sample albums
    const { albums, pagination } = await getPlexAlbums({ limit: 5 });

    return {
      connected: true,
      serverName: plexServer.friendlyName,
      serverVersion: plexServer.version,
      platform: plexServer.platform,
      musicLibraryTitle: section.title,
      sampleAlbums: albums,
      totalAlbums: pagination.total,
      message: `Successfully connected to Plex server "${plexServer.friendlyName}"`,
    };
  } catch (error) {
    console.error("Plex connection test failed:", error);
    return {
      connected: false,
      error: error.message,
      message: "Failed to connect to Plex server",
    };
  }
}

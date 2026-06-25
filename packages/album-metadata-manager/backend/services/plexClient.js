/**
 * Plex Client - Integration with local Plex Media Server
 *
 * This service connects to a local Plex server to retrieve music library data.
 * Requires PLEX_USERNAME and PLEX_PASSWORD environment variables.
 */

import { MyPlexAccount, Album } from "@ctrl/plex";
import { prisma } from "../prisma/client.js";

// Connection caches. The app talks to MANY Plex servers, so connections are keyed
// by stable identity rather than a single global. Both have a TTL so a stale/relayed
// connection eventually re-resolves.
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const accountConnections = new Map(); // authToken -> { account, at }
const serverConnections = new Map(); // machineIdentifier -> { server, at }

/**
 * Clear cached Plex connections. Pass a machineIdentifier to clear just that server,
 * or omit to clear everything (e.g. on disconnect).
 */
export function clearPlexCache(machineIdentifier = null) {
  if (machineIdentifier) {
    serverConnections.delete(machineIdentifier);
  } else {
    serverConnections.clear();
    accountConnections.clear();
  }
  console.log(`🔄 Plex cache cleared${machineIdentifier ? ` for ${machineIdentifier}` : ""}`);
}

/**
 * Connect (and cache) a MyPlexAccount for a given auth token.
 * @param {string} authToken - Plex account auth token
 * @returns {Promise<MyPlexAccount>}
 */
export async function getAccountConnection(authToken) {
  if (!authToken) {
    throw new Error("Plex not configured. Please sign in with Plex in Settings.");
  }
  const cached = accountConnections.get(authToken);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.account;
  }
  const account = await new MyPlexAccount(null, "", "", authToken).connect();
  accountConnections.set(authToken, { account, at: Date.now() });
  return account;
}

/**
 * Connect (and cache) a specific Plex server.
 * @param {Object} plexServer - PlexServer row; must include `machineIdentifier`,
 *   `name`, and the related `account` ({ authToken }).
 * @returns {Promise<PlexServer>} Connected @ctrl/plex server instance
 */
export async function getServerConnection(plexServer) {
  const machineId = plexServer.machineIdentifier;
  const cached = serverConnections.get(machineId);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.server;
  }

  const authToken = plexServer.account?.authToken;
  if (!authToken) {
    throw new Error(`Plex server "${plexServer.name}" is missing its account token.`);
  }

  const account = await getAccountConnection(authToken);
  const resources = await account.resources();
  const resource = resources.find(
    r => r.provides === "server" && r.clientIdentifier === machineId
  );
  if (!resource) {
    throw new Error(
      `Plex server "${plexServer.name}" (${machineId}) is not reachable on this account.`
    );
  }

  const server = await resource.connect();
  serverConnections.set(machineId, { server, at: Date.now() });
  return server;
}

/**
 * Resolve the music section for a PlexLibrary row, by its stable sectionKey.
 * @param {Object} plexLibrary - PlexLibrary row; must include the related `server`
 *   (with its `account`), plus `sectionKey` and `title`.
 * @returns {Promise<MusicSection>} The requested music section
 */
export async function getLibrarySection(plexLibrary) {
  const server = await getServerConnection(plexLibrary.server);
  const library = await server.library();
  const sections = await library.sections();
  const section = sections.find(s => String(s.key) === String(plexLibrary.sectionKey));
  if (!section) {
    throw new Error(
      `Plex section ${plexLibrary.sectionKey} ("${plexLibrary.title}") not found on "${plexLibrary.server.name}".`
    );
  }
  return await library.section(section.title);
}

/**
 * Discover the music servers available to an account (for the setup wizard).
 * @param {string} authToken - Plex account auth token
 * @returns {Promise<Array<{machineIdentifier, name, accessToken}>>}
 */
export async function discoverServers(authToken) {
  const account = await getAccountConnection(authToken);
  const resources = await account.resources();
  return resources
    .filter(r => r.provides === "server" && r.presence)
    .map(r => ({
      machineIdentifier: r.clientIdentifier,
      name: r.name,
      accessToken: r.accessToken,
    }));
}

/**
 * Discover the music (artist-type) library sections on a server (for the wizard).
 * @param {Object} plexServer - PlexServer row (with related `account`)
 * @returns {Promise<Array<{sectionKey, title, type}>>}
 */
export async function discoverLibraries(plexServer) {
  const server = await getServerConnection(plexServer);
  const library = await server.library();
  const sections = await library.sections();
  return sections
    .filter(s => s.type === "artist")
    .map(s => ({ sectionKey: String(s.key), title: s.title, type: s.type }));
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
export async function getPlexAlbums(server, section, options = {}) {
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

    const url = `/library/sections/${section.key}/all?${params.toString()}`;
    const response = await server.query(url);
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
      const artworkUrl = album.thumb ? server.url(album.thumb, true).toString() : null;

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
 * @param {PlexServer} server - Connected @ctrl/plex server (from getServerConnection)
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<Object|null>} Album with tracks or null
 */
export async function getPlexAlbum(server, albumId) {
  try {
    console.log(`📡 Fetching album: ${albumId}`);

    // Use raw Plex API to get album metadata with proper artwork
    const albumResponse = await server.query(`/library/metadata/${albumId}`);
    const album = albumResponse.MediaContainer?.Metadata?.[0];

    if (!album) {
      return null;
    }

    // Get tracks for this album
    const tracksResponse = await server.query(`/library/metadata/${albumId}/children`);
    const tracks = tracksResponse.MediaContainer?.Metadata || [];

    // Convert dates from Unix timestamps
    const addedAt = album.addedAt ? new Date(album.addedAt * 1000).toISOString() : null;
    const updatedAt = album.updatedAt ? new Date(album.updatedAt * 1000).toISOString() : null;

    // Convert relative artwork path to full URL with auth token
    const artworkUrl = album.thumb ? server.url(album.thumb, true).toString() : null;

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
 * @param {PlexServer} server - Connected @ctrl/plex server (from getServerConnection)
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<{thumbUrl: string|null, fullUrl: string|null}>} Artwork URLs
 */
export async function getPlexAlbumArtworkUrls(server, albumId) {
  try {
    // Make lightweight query to get just the album metadata (no tracks)
    const albumResponse = await server.query(`/library/metadata/${albumId}`);
    const album = albumResponse.MediaContainer?.Metadata?.[0];

    if (!album || !album.thumb) {
      return { thumbUrl: null, fullUrl: null };
    }

    // Get full resolution artwork URL (no compression)
    const fullUrl = server.url(album.thumb, true).toString();

    // Get thumbnail URL (500x500) for Retina/high-DPI displays
    // 500x500 covers 2x displays nicely (250px CSS @ 2x = 500px actual)
    // We need to manually construct this because server.url() strips query params
    const baseFullUrl = server.url(album.thumb, true).toString();
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
 * Get all available genres from a music library section
 * @param {MusicSection} section - Section from getLibrarySection
 * @returns {Promise<string[]>} List of genres
 */
export async function getPlexGenres(section) {
  try {
    const genres = await section.genres();
    return genres.map(genre => genre.title || genre.tag).sort();
  } catch (error) {
    console.error("Error fetching genres from Plex:", error);
    throw new Error(`Failed to fetch genres: ${error.message}`);
  }
}

/**
 * Get album directory from track file paths
 * @param {PlexServer} server - Connected @ctrl/plex server (from getServerConnection)
 * @param {string} albumId - Plex album rating key
 * @returns {Promise<string|null>} Album directory path or null
 */
export async function getAlbumLocation(server, albumId) {
  try {
    // Get tracks for this album
    const tracksResponse = await server.query(`/library/metadata/${albumId}/children`);
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
 * @param {PlexServer} server - Connected @ctrl/plex server (from getServerConnection)
 * @param {string} albumId - Plex album rating key
 * @param {number} unixTimestamp - Unix timestamp (seconds) to set as addedAt
 * @returns {Promise<Object>} Result with before/after values
 */
export async function updatePlexAlbumAddedAt(server, albumId, unixTimestamp) {
  // Get current addedAt value
  const albumResponse = await server.query(`/library/metadata/${albumId}`);
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
  await server.query(url, "PUT");

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
export async function testPlexConnection(plexLibrary) {
  try {
    const server = await getServerConnection(plexLibrary.server);
    const section = await getLibrarySection(plexLibrary);

    // Get sample albums
    const { albums, pagination } = await getPlexAlbums(server, section, { limit: 5 });

    return {
      connected: true,
      serverName: server.friendlyName,
      serverVersion: server.version,
      platform: server.platform,
      musicLibraryTitle: section.title,
      sampleAlbums: albums,
      totalAlbums: pagination.total,
      message: `Successfully connected to Plex server "${server.friendlyName}"`,
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

/**
 * Spotify Web API Integration
 *
 * API Docs: https://developer.spotify.com/documentation/web-api
 * Rate Limit: ~100 requests/second (generous limits, no strict enforcement needed)
 *
 * Authentication: OAuth 2.0 Client Credentials Flow
 * - Token endpoint: https://accounts.spotify.com/api/token
 * - Grant type: client_credentials
 * - Token lifespan: 1 hour
 * - Header: Authorization: Bearer {access_token}
 *
 * Key Endpoints:
 * - Search albums: /v1/search?q=...&type=album&limit=N
 *   Query format: album:"title" artist:"name" year:YYYY
 *   Returns: { albums: { items: [...] } }
 *
 * - Get album details: /v1/albums/{id}
 *   Returns: complete album object with tracks
 *
 * - Get artist details: /v1/artists/{id}
 *   Returns: artist object with genres (albums don't have genres)
 *
 * Response Structure:
 * - Album: id, name, artists, release_date, total_tracks, images, external_ids
 * - Artist: id, name, genres (array of genre strings)
 * - Images: array of { url, height, width } sorted by size
 */

async function getSpotifyAccessToken() {
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenResponse.ok) {
    throw new Error(`Spotify auth failed: ${tokenResponse.statusText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function searchSpotifyDirect(accessToken, albumTitle, artistName, year, returnAll = false) {
  // Simple direct search query
  const query = `album:"${albumTitle}" artist:"${artistName}"${year ? ` year:${year}` : ""}`;

  console.log(`Spotify searching: ${query}`);

  const searchResponse = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchResponse.ok) {
    console.warn(`Spotify search failed: ${searchResponse.statusText}`);
    return returnAll ? [] : null;
  }

  const searchData = await searchResponse.json();

  if (!searchData.albums.items || searchData.albums.items.length === 0) {
    console.log(`Spotify search returned no results`);
    return returnAll ? [] : null;
  }

  // Return all results without confidence filtering
  if (returnAll) {
    console.log(`Spotify found ${searchData.albums.items.length} results`);
    return searchData.albums.items;
  } else {
    // Return first result
    const firstAlbum = searchData.albums.items[0];
    console.log(`Spotify found match: "${firstAlbum.name}" by "${firstAlbum.artists[0]?.name}"`);
    return firstAlbum;
  }
}

async function formatSpotifyResult(album, accessToken) {
  // Get genre from the primary artist
  let genre = null;
  let artistData = null;
  if (album.artists && album.artists.length > 0) {
    const artistId = album.artists[0].id;
    try {
      const artistResponse = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (artistResponse.ok) {
        artistData = await artistResponse.json();
        genre =
          artistData.genres && artistData.genres.length > 0
            ? artistData.genres.map(g => g.toLowerCase()).join("; ")
            : null;
      }
    } catch (error) {
      console.warn("Failed to fetch artist genres from Spotify:", error.message);
    }
  }

  // Pick highest-resolution artwork (Spotify images sorted desc by size)
  let bestArtwork = null;
  if (album.images && album.images.length > 0) {
    const largest = album.images[0];
    bestArtwork = {
      url: largest.url,
      width: largest.width,
      height: largest.height,
      mime: "image/jpeg",
      type: "front",
    };
  }

  return {
    title: album.name,
    artist: album.artists[0]?.name,
    year: album.release_date ? new Date(album.release_date).getFullYear() : null,
    trackCount: album.total_tracks,
    genre: genre,
    source: "spotify",
    artwork: bestArtwork ? { best: bestArtwork, candidates: [bestArtwork] } : null,
  };
}

export async function searchSpotify(albumTitle, artistName, year, options = {}) {
  try {
    const accessToken = await getSpotifyAccessToken();
    const returnAll = options.returnAll || false;

    console.log(`Spotify searching for "${albumTitle}" by "${artistName}"`);

    const result = await searchSpotifyDirect(accessToken, albumTitle, artistName, year, returnAll);

    if (returnAll) {
      // Format all matches
      const formattedMatches = [];
      if (result && result.length > 0) {
        for (const album of result) {
          const formattedResult = await formatSpotifyResult(album, accessToken);
          formattedMatches.push(formattedResult);
        }
      }

      console.log(`Spotify found ${formattedMatches.length} matches total`);

      return {
        status: "success",
        data: formattedMatches,
        bestMatch: formattedMatches[0] || null,
        totalResults: formattedMatches.length,
      };
    } else {
      // Original behavior - return first match
      if (result) {
        const formattedResult = await formatSpotifyResult(result, accessToken);

        console.log(
          `Spotify match found: "${formattedResult.title}" by "${formattedResult.artist}"`
        );

        return {
          status: "success",
          data: formattedResult,
        };
      }

      // No results found
      console.log(`Spotify found no suitable matches for "${albumTitle}" by "${artistName}"`);
      return { status: "success", data: null };
    }
  } catch (error) {
    console.error("Spotify search error:", error);
    return {
      status: "error",
      message: error.message,
    };
  }
}

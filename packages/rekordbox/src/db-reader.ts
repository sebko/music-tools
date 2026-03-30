import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  RekordboxTrack,
  RekordboxPlaylist,
  RekordboxNode,
  RekordboxXmlData,
} from './types.js';

const require = createRequire(import.meta.url);

const DB_KEY =
  '402fd482c38817c35ffa8ffb8c7d93143b749e7d315df7a81732a1ff43608497';

const DEFAULT_DB_PATH = join(
  homedir(),
  'Library/Pioneer/rekordbox/master.db',
);

interface DbTrackRow {
  ID: string;
  Title: string | null;
  Artist: string | null;
  Album: string | null;
  Genre: string | null;
  FolderPath: string | null;
  Length: number | null;
  BitRate: number | null;
  Rating: number | null;
  BPM: number | null;
  Tonality: string | null;
  DateCreated: string | null;
  DJPlayCount: string | null;
  Commnt: string | null;
  ReleaseYear: number | null;
  SampleRate: number | null;
  Kind: string | null;
  Composer: string | null;
}

interface DbPlaylistRow {
  ID: string;
  Name: string | null;
  Attribute: number;
  ParentID: string | null;
}

interface DbSongPlaylistRow {
  ContentID: string;
  TrackNo: number;
}

const TRACK_QUERY = `
  SELECT
    c.ID,
    c.Title,
    a.Name as Artist,
    al.Name as Album,
    g.Name as Genre,
    c.FolderPath,
    c.Length,
    c.BitRate,
    c.Rating,
    c.BPM,
    k.ScaleName as Tonality,
    c.DateCreated,
    c.DJPlayCount,
    c.Commnt,
    c.ReleaseYear,
    c.SampleRate,
    c.FileType as Kind,
    comp.Name as Composer
  FROM djmdContent c
  LEFT JOIN djmdArtist a ON c.ArtistID = a.ID
  LEFT JOIN djmdAlbum al ON c.AlbumID = al.ID
  LEFT JOIN djmdGenre g ON c.GenreID = g.ID
  LEFT JOIN djmdKey k ON c.KeyID = k.ID
  LEFT JOIN djmdArtist comp ON c.ComposerID = comp.ID
`;

function mapRow(row: DbTrackRow): RekordboxTrack {
  return {
    trackId: Number(row.ID) || 0,
    name: row.Title ?? '',
    artist: row.Artist ?? '',
    album: row.Album ?? '',
    genre: row.Genre ?? '',
    location: row.FolderPath ?? '',
    totalTime: row.Length ?? 0,
    bitRate: row.BitRate ?? 0,
    rating: row.Rating ?? 0,
    averageBpm: (row.BPM ?? 0) / 100,
    tonality: row.Tonality ?? '',
    dateAdded: row.DateCreated ?? '',
    playCount: Number(row.DJPlayCount) || 0,
    comments: row.Commnt ?? '',
    year: row.ReleaseYear != null ? String(row.ReleaseYear) : '',
    sampleRate: row.SampleRate ?? 0,
    kind: row.Kind != null ? String(row.Kind) : '',
    composer: row.Composer ?? '',
  };
}

function buildPlaylistTree(
  playlistRows: DbPlaylistRow[],
  songsByPlaylist: Map<string, number[]>,
): { tree: RekordboxNode; playlists: RekordboxPlaylist[] } {
  const flatPlaylists: RekordboxPlaylist[] = [];

  // Build ID -> row map
  const byId = new Map<string, DbPlaylistRow>();
  for (const row of playlistRows) {
    byId.set(row.ID, row);
  }

  // Build children map
  const childrenOf = new Map<string, DbPlaylistRow[]>();
  const roots: DbPlaylistRow[] = [];

  for (const row of playlistRows) {
    if (!row.ParentID || row.ParentID === 'root') {
      roots.push(row);
    } else {
      const list = childrenOf.get(row.ParentID) ?? [];
      list.push(row);
      childrenOf.set(row.ParentID, list);
    }
  }

  function buildNode(row: DbPlaylistRow, parentPath: string): RekordboxNode {
    const name = row.Name ?? '';
    const path = parentPath ? `${parentPath}/${name}` : name;
    const isFolder = row.Attribute === 1;

    if (isFolder) {
      const children = (childrenOf.get(row.ID) ?? []).map((child) =>
        buildNode(child, path),
      );
      return { type: 'folder', name, path, children };
    } else {
      const trackKeys = songsByPlaylist.get(row.ID) ?? [];
      const playlist: RekordboxPlaylist = { name, path, trackKeys };
      flatPlaylists.push(playlist);
      return { type: 'playlist', name, path, trackKeys };
    }
  }

  const children = roots.map((r) => buildNode(r, ''));
  const tree: RekordboxNode = {
    type: 'folder',
    name: 'ROOT',
    path: 'ROOT',
    children,
  };

  return { tree, playlists: flatPlaylists };
}

export function readRekordboxDb(
  dbPath: string = DEFAULT_DB_PATH,
): RekordboxXmlData {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3-multiple-ciphers');
  const db = new Database(dbPath, { readonly: true });

  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma('legacy=4');
    db.pragma(`key="${DB_KEY}"`);

    // Read tracks
    const trackRows = db.prepare(TRACK_QUERY).all() as DbTrackRow[];
    const tracks = new Map<number, RekordboxTrack>();
    for (const row of trackRows) {
      const track = mapRow(row);
      tracks.set(track.trackId, track);
    }

    // Read playlists
    const playlistRows = db
      .prepare(
        'SELECT ID, Name, Attribute, ParentID FROM djmdPlaylist WHERE Attribute >= 0 ORDER BY Name',
      )
      .all() as DbPlaylistRow[];

    // Read playlist contents — map ContentID to trackId (numeric)
    const songsByPlaylist = new Map<string, number[]>();
    const songRows = db
      .prepare(
        'SELECT PlaylistID, ContentID, TrackNo FROM djmdSongPlaylist ORDER BY TrackNo',
      )
      .all() as (DbSongPlaylistRow & { PlaylistID: string })[];

    for (const row of songRows) {
      const list = songsByPlaylist.get(row.PlaylistID) ?? [];
      list.push(Number(row.ContentID) || 0);
      songsByPlaylist.set(row.PlaylistID, list);
    }

    const { tree, playlists } = buildPlaylistTree(
      playlistRows,
      songsByPlaylist,
    );

    return {
      version: '',
      product: { name: 'rekordbox', version: '', company: 'Pioneer DJ' },
      tracks,
      playlistTree: tree,
      playlists,
    };
  } finally {
    db.close();
  }
}

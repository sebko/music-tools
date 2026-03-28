import { readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import type {
  RekordboxTrack,
  RekordboxPlaylist,
  RekordboxNode,
  RekordboxXmlData,
} from './types.js';

function parseNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function parseStr(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function decodeLocation(location: string): string {
  if (!location) return '';
  const stripped = location.replace(/^file:\/\/localhost/, '');
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

function mapTrack(attrs: Record<string, unknown>): RekordboxTrack {
  return {
    trackId: parseNum(attrs.TrackID),
    name: parseStr(attrs.Name),
    artist: parseStr(attrs.Artist),
    album: parseStr(attrs.Album),
    genre: parseStr(attrs.Genre),
    location: decodeLocation(parseStr(attrs.Location)),
    totalTime: parseNum(attrs.TotalTime),
    bitRate: parseNum(attrs.BitRate),
    rating: parseNum(attrs.Rating),
    averageBpm: parseNum(attrs.AverageBpm),
    tonality: parseStr(attrs.Tonality),
    dateAdded: parseStr(attrs.DateAdded),
    playCount: parseNum(attrs.PlayCount),
    comments: parseStr(attrs.Comments),
    year: parseStr(attrs.Year),
    sampleRate: parseNum(attrs.SampleRate),
    kind: parseStr(attrs.Kind),
    composer: parseStr(attrs.Composer),
  };
}

function buildTree(
  nodes: unknown[],
  parentPath: string,
  playlists: RekordboxPlaylist[],
): RekordboxNode[] {
  const result: RekordboxNode[] = [];

  for (const raw of nodes) {
    const node = raw as Record<string, unknown>;
    const name = parseStr(node.Name);
    const type = parseNum(node.Type);
    const path = parentPath ? `${parentPath}/${name}` : name;

    if (type === 0) {
      // Folder
      const childNodes = (node.NODE as unknown[] | undefined) ?? [];
      const children = buildTree(childNodes, path, playlists);
      result.push({ type: 'folder', name, path, children });
    } else if (type === 1) {
      // Playlist
      const trackEntries = (node.TRACK as unknown[] | undefined) ?? [];
      const trackKeys = trackEntries.map((t) =>
        parseNum((t as Record<string, unknown>).Key),
      );
      const playlist: RekordboxPlaylist = { name, path, trackKeys };
      playlists.push(playlist);
      result.push({ type: 'playlist', name, path, trackKeys });
    }
  }

  return result;
}

export async function parseRekordboxXml(
  xmlPath: string,
): Promise<RekordboxXmlData> {
  const xml = await readFile(xmlPath, 'utf-8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (_name, jpath) => {
      const jp = String(jpath);
      return (
        jp === 'DJ_PLAYLISTS.COLLECTION.TRACK' ||
        jp.endsWith('.NODE') ||
        jp.endsWith('.TRACK')
      );
    },
  });

  const parsed = parser.parse(xml);
  const root = parsed.DJ_PLAYLISTS;

  if (!root) {
    throw new Error(
      'Invalid Rekordbox XML: missing DJ_PLAYLISTS root element',
    );
  }

  // Product info
  const product = {
    name: parseStr(root.PRODUCT?.Name),
    version: parseStr(root.PRODUCT?.Version),
    company: parseStr(root.PRODUCT?.Company),
  };

  // Tracks
  const tracks = new Map<number, RekordboxTrack>();
  const rawTracks =
    (root.COLLECTION?.TRACK as Record<string, unknown>[] | undefined) ?? [];
  for (const rawTrack of rawTracks) {
    const track = mapTrack(rawTrack);
    tracks.set(track.trackId, track);
  }

  // Playlists — the XML has a single ROOT node under PLAYLISTS
  const playlists: RekordboxPlaylist[] = [];
  const rawRootNodes =
    (root.PLAYLISTS?.NODE as unknown[] | undefined) ?? [];

  // The first (and usually only) NODE under PLAYLISTS is the ROOT folder.
  // Build the tree from its children to avoid a redundant wrapper.
  let playlistTree: RekordboxNode;
  if (rawRootNodes.length === 1) {
    const rootNode = rawRootNodes[0] as Record<string, unknown>;
    const childNodes = (rootNode.NODE as unknown[] | undefined) ?? [];
    const children = buildTree(childNodes, '', playlists);
    playlistTree = {
      type: 'folder',
      name: parseStr(rootNode.Name),
      path: parseStr(rootNode.Name),
      children,
    };
  } else {
    const children = buildTree(rawRootNodes, '', playlists);
    playlistTree = { type: 'folder', name: 'ROOT', path: 'ROOT', children };
  }

  return {
    version: parseStr(root.Version),
    product,
    tracks,
    playlistTree,
    playlists,
  };
}

import { parseRekordboxXml } from './xml-parser.js';
import { readRekordboxDb } from './db-reader.js';
import type {
  RekordboxTrack,
  RekordboxPlaylist,
  RekordboxNode,
  RekordboxXmlData,
  TrackSearchCriteria,
  PlaylistComparison,
} from './types.js';

export class RekordboxLibrary {
  private data: RekordboxXmlData;

  private constructor(data: RekordboxXmlData) {
    this.data = data;
  }

  static async loadFromXml(xmlPath: string): Promise<RekordboxLibrary> {
    const data = await parseRekordboxXml(xmlPath);
    return new RekordboxLibrary(data);
  }

  static loadFromDb(dbPath?: string): RekordboxLibrary {
    const data = readRekordboxDb(dbPath);
    return new RekordboxLibrary(data);
  }

  static async load(pathOrDb?: string): Promise<RekordboxLibrary> {
    if (pathOrDb?.endsWith('.xml')) {
      return RekordboxLibrary.loadFromXml(pathOrDb);
    }
    return RekordboxLibrary.loadFromDb(pathOrDb);
  }

  // --- Track access ---

  getAllTracks(): RekordboxTrack[] {
    return [...this.data.tracks.values()];
  }

  getTrackById(id: number): RekordboxTrack | undefined {
    return this.data.tracks.get(id);
  }

  getTrackCount(): number {
    return this.data.tracks.size;
  }

  // --- Playlist access ---

  getPlaylists(): RekordboxPlaylist[] {
    return this.data.playlists;
  }

  getPlaylistTree(): RekordboxNode {
    return this.data.playlistTree;
  }

  getPlaylistByName(name: string): RekordboxPlaylist | undefined {
    // Try exact match first, then case-insensitive
    return (
      this.data.playlists.find((p) => p.name === name) ??
      this.data.playlists.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      )
    );
  }

  getPlaylistByPath(path: string): RekordboxPlaylist | undefined {
    return (
      this.data.playlists.find((p) => p.path === path) ??
      this.data.playlists.find(
        (p) => p.path.toLowerCase() === path.toLowerCase(),
      )
    );
  }

  getPlaylistNames(): string[] {
    return this.data.playlists.map((p) => p.name);
  }

  getTracksInPlaylist(nameOrPath: string): RekordboxTrack[] {
    const playlist =
      this.getPlaylistByPath(nameOrPath) ??
      this.getPlaylistByName(nameOrPath);

    if (!playlist) return [];

    return playlist.trackKeys
      .map((key) => this.data.tracks.get(key))
      .filter((t): t is RekordboxTrack => t !== undefined);
  }

  // --- Search ---

  searchTracks(criteria: TrackSearchCriteria): RekordboxTrack[] {
    const results: RekordboxTrack[] = [];

    for (const track of this.data.tracks.values()) {
      if (
        criteria.artist &&
        !track.artist.toLowerCase().includes(criteria.artist.toLowerCase())
      ) {
        continue;
      }
      if (
        criteria.name &&
        !track.name.toLowerCase().includes(criteria.name.toLowerCase())
      ) {
        continue;
      }
      if (
        criteria.genre &&
        !track.genre.toLowerCase().includes(criteria.genre.toLowerCase())
      ) {
        continue;
      }
      if (
        criteria.tonality &&
        track.tonality.toLowerCase() !== criteria.tonality.toLowerCase()
      ) {
        continue;
      }
      if (
        criteria.bpmMin !== undefined &&
        track.averageBpm < criteria.bpmMin
      ) {
        continue;
      }
      if (
        criteria.bpmMax !== undefined &&
        track.averageBpm > criteria.bpmMax
      ) {
        continue;
      }

      results.push(track);
    }

    return results;
  }

  // --- Comparison ---

  comparePlaylists(
    nameOrPathA: string,
    nameOrPathB: string,
  ): PlaylistComparison {
    const playlistA =
      this.getPlaylistByPath(nameOrPathA) ??
      this.getPlaylistByName(nameOrPathA);
    const playlistB =
      this.getPlaylistByPath(nameOrPathB) ??
      this.getPlaylistByName(nameOrPathB);

    if (!playlistA) {
      throw new Error(`Playlist not found: ${nameOrPathA}`);
    }
    if (!playlistB) {
      throw new Error(`Playlist not found: ${nameOrPathB}`);
    }

    const setA = new Set(playlistA.trackKeys);
    const setB = new Set(playlistB.trackKeys);

    const onlyInAKeys = playlistA.trackKeys.filter((k) => !setB.has(k));
    const onlyInBKeys = playlistB.trackKeys.filter((k) => !setA.has(k));
    const intersectionKeys = playlistA.trackKeys.filter((k) => setB.has(k));

    const resolve = (keys: number[]) =>
      keys
        .map((k) => this.data.tracks.get(k))
        .filter((t): t is RekordboxTrack => t !== undefined);

    return {
      playlistA: playlistA.path,
      playlistB: playlistB.path,
      onlyInA: resolve(onlyInAKeys),
      onlyInB: resolve(onlyInBKeys),
      intersection: resolve(intersectionKeys),
      aContainsB: onlyInBKeys.length === 0,
      bContainsA: onlyInAKeys.length === 0,
      identical: onlyInAKeys.length === 0 && onlyInBKeys.length === 0,
    };
  }

  // --- Duplicates ---

  findDuplicates(): Map<string, RekordboxTrack[]> {
    const grouped = new Map<string, RekordboxTrack[]>();

    for (const track of this.data.tracks.values()) {
      const key = `${track.artist.toLowerCase().trim()} - ${track.name.toLowerCase().trim()}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(track);
      } else {
        grouped.set(key, [track]);
      }
    }

    // Only return groups with duplicates
    const duplicates = new Map<string, RekordboxTrack[]>();
    for (const [key, tracks] of grouped) {
      if (tracks.length > 1) {
        duplicates.set(key, tracks);
      }
    }

    return duplicates;
  }

  // --- Raw data access ---

  getRawData(): RekordboxXmlData {
    return this.data;
  }
}

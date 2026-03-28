export interface RekordboxTrack {
  trackId: number;
  name: string;
  artist: string;
  album: string;
  genre: string;
  location: string;
  totalTime: number;
  bitRate: number;
  rating: number;
  averageBpm: number;
  tonality: string;
  dateAdded: string;
  playCount: number;
  comments: string;
  year: string;
  sampleRate: number;
  kind: string;
  composer: string;
}

export interface RekordboxPlaylist {
  name: string;
  path: string;
  trackKeys: number[];
}

export interface RekordboxFolder {
  name: string;
  path: string;
  children: RekordboxNode[];
}

export type RekordboxNode =
  | (RekordboxFolder & { type: 'folder' })
  | (RekordboxPlaylist & { type: 'playlist' });

export interface RekordboxXmlData {
  version: string;
  product: { name: string; version: string; company: string };
  tracks: Map<number, RekordboxTrack>;
  playlistTree: RekordboxNode;
  playlists: RekordboxPlaylist[];
}

export interface TrackSearchCriteria {
  artist?: string;
  name?: string;
  genre?: string;
  bpmMin?: number;
  bpmMax?: number;
  tonality?: string;
}

export interface PlaylistComparison {
  playlistA: string;
  playlistB: string;
  onlyInA: RekordboxTrack[];
  onlyInB: RekordboxTrack[];
  intersection: RekordboxTrack[];
  aContainsB: boolean;
  bContainsA: boolean;
  identical: boolean;
}

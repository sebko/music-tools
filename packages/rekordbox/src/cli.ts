#!/usr/bin/env node

import { Command } from 'commander';
import { homedir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { RekordboxLibrary } from './rekordbox-library.js';
import type { RekordboxNode, RekordboxTrack } from './types.js';

dotenv.config({ path: '../../.env' });

const DEFAULT_XML_PATH = join(
  homedir(),
  'Library/Pioneer/rekordbox/rekordbox.xml',
);

function getXmlPath(options: { xmlPath?: string }): string {
  return (
    options.xmlPath ??
    process.env.REKORDBOX_XML_PATH ??
    DEFAULT_XML_PATH
  );
}

async function loadLibrary(options: { xmlPath?: string }) {
  const xmlPath = getXmlPath(options);
  return RekordboxLibrary.load(xmlPath);
}

function formatTrackRow(t: RekordboxTrack): string {
  const bpm = t.averageBpm ? t.averageBpm.toFixed(1) : '-';
  const key = t.tonality || '-';
  return `  ${t.artist} - ${t.name}  [${bpm} BPM, ${key}]`;
}

function printTree(node: RekordboxNode, indent = 0): void {
  const prefix = '  '.repeat(indent);
  if (node.type === 'folder') {
    console.log(`${prefix}${node.name}/`);
    for (const child of node.children) {
      printTree(child, indent + 1);
    }
  } else {
    console.log(`${prefix}${node.name} (${node.trackKeys.length} tracks)`);
  }
}

const program = new Command();

program
  .name('rekordbox')
  .description('Query your Rekordbox XML library')
  .version('1.0.0')
  .option(
    '--xml-path <path>',
    'Path to rekordbox.xml export file',
  );

program
  .command('info')
  .description('Show collection summary')
  .action(async (_opts, cmd) => {
    try {
      const lib = await loadLibrary(cmd.optsWithGlobals());
      const data = lib.getRawData();
      console.log(`Product: ${data.product.name} ${data.product.version}`);
      console.log(`Tracks: ${lib.getTrackCount()}`);
      console.log(`Playlists: ${lib.getPlaylists().length}`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('playlists')
  .description('List all playlists')
  .option('--tree', 'Show hierarchical folder structure')
  .action(async (opts, cmd) => {
    try {
      const lib = await loadLibrary(cmd.optsWithGlobals());

      if (opts.tree) {
        printTree(lib.getPlaylistTree());
      } else {
        for (const p of lib.getPlaylists()) {
          console.log(`${p.path} (${p.trackKeys.length} tracks)`);
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('tracks')
  .argument('<playlist>', 'Playlist name or path')
  .description('List tracks in a playlist')
  .option('--format <format>', 'Output format: table or json', 'table')
  .action(async (playlist, opts, cmd) => {
    try {
      const lib = await loadLibrary(cmd.optsWithGlobals());
      const tracks = lib.getTracksInPlaylist(playlist);

      if (tracks.length === 0) {
        console.log(`No tracks found (playlist "${playlist}" not found or empty)`);
        return;
      }

      if (opts.format === 'json') {
        console.log(JSON.stringify(tracks, null, 2));
      } else {
        console.log(`${playlist} (${tracks.length} tracks):\n`);
        for (const t of tracks) {
          console.log(formatTrackRow(t));
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search tracks in the collection')
  .option('--artist <artist>', 'Filter by artist')
  .option('--name <name>', 'Filter by track name')
  .option('--genre <genre>', 'Filter by genre')
  .option('--bpm-min <bpm>', 'Minimum BPM', parseFloat)
  .option('--bpm-max <bpm>', 'Maximum BPM', parseFloat)
  .option('--key <key>', 'Filter by musical key')
  .option('--format <format>', 'Output format: table or json', 'table')
  .action(async (opts, cmd) => {
    try {
      const lib = await loadLibrary(cmd.optsWithGlobals());
      const tracks = lib.searchTracks({
        artist: opts.artist,
        name: opts.name,
        genre: opts.genre,
        bpmMin: opts.bpmMin,
        bpmMax: opts.bpmMax,
        tonality: opts.key,
      });

      if (tracks.length === 0) {
        console.log('No matching tracks found.');
        return;
      }

      if (opts.format === 'json') {
        console.log(JSON.stringify(tracks, null, 2));
      } else {
        console.log(`Found ${tracks.length} tracks:\n`);
        for (const t of tracks) {
          console.log(formatTrackRow(t));
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('compare')
  .arguments('<playlistA> <playlistB>')
  .description('Compare two playlists')
  .option('--show-tracks', 'Show track details in each section')
  .action(async (playlistA, playlistB, opts, cmd) => {
    try {
      const lib = await loadLibrary(cmd.optsWithGlobals());
      const result = lib.comparePlaylists(playlistA, playlistB);

      if (result.identical) {
        console.log('Playlists are identical.');
      } else if (result.aContainsB) {
        console.log(`"${result.playlistA}" contains all tracks from "${result.playlistB}".`);
      } else if (result.bContainsA) {
        console.log(`"${result.playlistB}" contains all tracks from "${result.playlistA}".`);
      } else {
        console.log('Playlists partially overlap.');
      }

      console.log(`\nShared: ${result.intersection.length} tracks`);
      console.log(`Only in ${result.playlistA}: ${result.onlyInA.length} tracks`);
      console.log(`Only in ${result.playlistB}: ${result.onlyInB.length} tracks`);

      if (opts.showTracks) {
        if (result.onlyInA.length > 0) {
          console.log(`\nOnly in ${result.playlistA}:`);
          for (const t of result.onlyInA) {
            console.log(formatTrackRow(t));
          }
        }
        if (result.onlyInB.length > 0) {
          console.log(`\nOnly in ${result.playlistB}:`);
          for (const t of result.onlyInB) {
            console.log(formatTrackRow(t));
          }
        }
        if (result.intersection.length > 0) {
          console.log(`\nShared tracks:`);
          for (const t of result.intersection) {
            console.log(formatTrackRow(t));
          }
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('duplicates')
  .description('Find duplicate tracks in the collection')
  .option('--format <format>', 'Output format: table or json', 'table')
  .action(async (opts, cmd) => {
    try {
      const lib = await loadLibrary(cmd.optsWithGlobals());
      const duplicates = lib.findDuplicates();

      if (duplicates.size === 0) {
        console.log('No duplicate tracks found.');
        return;
      }

      if (opts.format === 'json') {
        const obj = Object.fromEntries(duplicates);
        console.log(JSON.stringify(obj, null, 2));
      } else {
        console.log(`Found ${duplicates.size} groups of duplicates:\n`);
        for (const [key, tracks] of duplicates) {
          console.log(`${key} (${tracks.length} copies):`);
          for (const t of tracks) {
            console.log(`  ID ${t.trackId}: ${t.location}`);
          }
          console.log();
        }
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();

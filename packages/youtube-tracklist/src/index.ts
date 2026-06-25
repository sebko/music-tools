import dotenv from 'dotenv';
import { YouTubeClient } from './youtube-client.js';
import { ClaudeClient } from './claude-client.js';
import { CommentProcessor } from './comment-processor.js';
import { TracklistResult, TrackEntry } from './types.js';

// Load environment variables from root
dotenv.config({ path: '../../.env' });

export * from './types.js';

export class YouTubeTracklistExtractor {
  private youtubeClient: YouTubeClient;
  private claudeClient: ClaudeClient;

  constructor(youtubeApiKey?: string, claudeApiKey?: string) {
    const ytKey = youtubeApiKey || process.env.YOUTUBE_API_KEY;
    const claudeKey = claudeApiKey || process.env.ANTHROPIC_API_KEY;

    if (!ytKey) {
      throw new Error('YouTube API key is required. Set YOUTUBE_API_KEY environment variable.');
    }
    if (!claudeKey) {
      throw new Error('Claude API key is required. Set ANTHROPIC_API_KEY environment variable.');
    }

    this.youtubeClient = new YouTubeClient(ytKey);
    this.claudeClient = new ClaudeClient(claudeKey);
  }

  async extractTracklist(videoUrl: string, options?: {
    maxComments?: number;
    minConfidence?: number;
  }): Promise<TracklistResult> {
    const videoId = YouTubeClient.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL or video ID');
    }

    const startTime = new Date().toISOString();
    const maxComments = options?.maxComments || 1000;
    const minConfidence = options?.minConfidence || 0.3;

    try {
      // 1. Fetch comments from YouTube
      console.log(`Fetching comments for video: ${videoId}`);
      const threads = await this.youtubeClient.getVideoComments(videoId, maxComments);
      console.log(`Found ${threads.length} total comment threads`);
      
      // 2. Filter and prioritize relevant comments
      const relevantThreads = CommentProcessor.filterRelevantThreads(threads);
      console.log(`Filtered to ${relevantThreads.length} relevant threads`);
      const prioritizedThreads = CommentProcessor.prioritizeComments(relevantThreads);
      
      // 3. Batch comments for AI processing
      const commentBatches = CommentProcessor.batchComments(prioritizedThreads);
      
      console.log(`Processing ${commentBatches.length} batches of comments...`);
      
      // 4. Extract tracks using Claude AI
      const allTracks: TrackEntry[] = [];
      let apiCalls = 0;

      for (const batch of commentBatches) {
        try {
          const tracks = await this.claudeClient.extractTracksFromComments(batch);
          allTracks.push(...tracks.filter(track => track.confidence >= minConfidence));
          apiCalls++;
          
          // Rate limiting - small delay between batches
          if (apiCalls < commentBatches.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.warn(`Failed to process batch: ${error}`);
        }
      }

      // 5. Deduplicate and merge similar tracks
      const deduplicatedTracks = this.deduplicateTracks(allTracks);

      return {
        tracks: deduplicatedTracks,
        metadata: {
          videoId,
          totalComments: threads.length,
          processedComments: relevantThreads.length,
          extractionTime: startTime,
          apiCalls,
        }
      };
    } catch (error) {
      throw new Error(`Failed to extract tracklist: ${error}`);
    }
  }

  private deduplicateTracks(tracks: TrackEntry[]): TrackEntry[] {
    const seen = new Map<string, TrackEntry>();

    for (const track of tracks) {
      const key = this.normalizeTrackKey(track.artist, track.title);
      
      if (!seen.has(key)) {
        seen.set(key, track);
      } else {
        // Keep the track with higher confidence
        const existing = seen.get(key)!;
        if (track.confidence > existing.confidence) {
          seen.set(key, track);
        }
      }
    }

    return Array.from(seen.values()).sort((a, b) => {
      // Sort by timestamp if available, otherwise by confidence
      if (a.timestamp && b.timestamp) {
        return this.timeToSeconds(a.timestamp) - this.timeToSeconds(b.timestamp);
      }
      return b.confidence - a.confidence;
    });
  }

  private normalizeTrackKey(artist: string, title: string): string {
    const normalize = (str: string) => str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return `${normalize(artist)}-${normalize(title)}`;
  }

  private timeToSeconds(timestamp: string): number {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
}

// Convenience function for simple usage
export async function extractTracklist(videoUrl: string): Promise<TracklistResult> {
  const extractor = new YouTubeTracklistExtractor();
  return extractor.extractTracklist(videoUrl);
}
import { google } from 'googleapis';
import { YouTubeComment, CommentThread } from './types.js';

export class YouTubeClient {
  private youtube;

  constructor(apiKey: string) {
    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey,
    });
  }

  async getVideoComments(videoId: string, maxResults = 1000): Promise<CommentThread[]> {
    const threads: CommentThread[] = [];
    let nextPageToken: string | undefined;

    try {
      do {
        console.log(`Requesting comments with pageToken: ${nextPageToken || 'none'}`);
        const response = await this.youtube.commentThreads.list({
          part: ['snippet', 'replies'],
          videoId,
          maxResults: Math.min(100, maxResults - threads.length),
          order: 'relevance',
          pageToken: nextPageToken,
        });

        console.log(`YouTube API response: ${response.data.items?.length || 0} items`);
        const items = response.data.items || [];
        
        for (const item of items) {
          const topComment = item.snippet?.topLevelComment?.snippet;
          if (!topComment) continue;

          const thread: CommentThread = {
            id: item.id || '',
            topLevelComment: {
              id: item.snippet?.topLevelComment?.id || '',
              text: topComment.textDisplay || '',
              authorDisplayName: topComment.authorDisplayName || '',
              likeCount: topComment.likeCount || 0,
              publishedAt: topComment.publishedAt || '',
            },
            replies: [],
            totalReplyCount: item.snippet?.totalReplyCount || 0,
          };

          // Add replies if they exist
          if (item.replies?.comments) {
            thread.replies = item.replies.comments.map(reply => ({
              id: reply.id || '',
              text: reply.snippet?.textDisplay || '',
              authorDisplayName: reply.snippet?.authorDisplayName || '',
              likeCount: reply.snippet?.likeCount || 0,
              publishedAt: reply.snippet?.publishedAt || '',
            }));
          }

          threads.push(thread);
        }

        nextPageToken = response.data.nextPageToken || undefined;
      } while (nextPageToken && threads.length < maxResults);

      return threads;
    } catch (error) {
      throw new Error(`Failed to fetch YouTube comments: ${error}`);
    }
  }

  static extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}
export interface TrackEntry {
  artist: string;
  title: string;
  timestamp?: string;
  confidence: number;
  context: string;
  language?: string;
}

export interface ExtractionMetadata {
  videoId: string;
  totalComments: number;
  processedComments: number;
  extractionTime: string;
  apiCalls: number;
}

export interface TracklistResult {
  tracks: TrackEntry[];
  metadata: ExtractionMetadata;
}

export interface YouTubeComment {
  id: string;
  text: string;
  authorDisplayName: string;
  likeCount: number;
  publishedAt: string;
  replies?: YouTubeComment[];
}

export interface CommentThread {
  id: string;
  topLevelComment: YouTubeComment;
  replies: YouTubeComment[];
  totalReplyCount: number;
}
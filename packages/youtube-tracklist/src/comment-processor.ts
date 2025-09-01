import { CommentThread, YouTubeComment } from './types.js';

export class CommentProcessor {
  static batchComments(threads: CommentThread[], batchSize = 50): string[][] {
    const allComments = this.flattenComments(threads);
    const batches: string[][] = [];
    
    for (let i = 0; i < allComments.length; i += batchSize) {
      const batch = allComments.slice(i, i + batchSize);
      batches.push(batch);
    }
    
    return batches;
  }

  static flattenComments(threads: CommentThread[]): string[] {
    const comments: string[] = [];
    
    for (const thread of threads) {
      // Add main comment
      comments.push(this.formatCommentForAI(thread.topLevelComment, 'main'));
      
      // Add replies with context
      for (const reply of thread.replies) {
        const contextualReply = this.formatCommentForAI(reply, 'reply', thread.topLevelComment.text);
        comments.push(contextualReply);
      }
    }
    
    return comments;
  }

  static formatCommentForAI(comment: YouTubeComment, type: 'main' | 'reply', parentText?: string): string {
    const prefix = type === 'reply' && parentText 
      ? `[Reply to: "${this.truncateText(parentText, 50)}"] ` 
      : '';
    
    const engagement = comment.likeCount > 0 ? ` (${comment.likeCount} likes)` : '';
    
    return `${prefix}${comment.text}${engagement}`;
  }

  static prioritizeComments(threads: CommentThread[]): CommentThread[] {
    return threads.sort((a, b) => {
      // Prioritize by engagement (likes + replies)
      const scoreA = a.topLevelComment.likeCount + a.totalReplyCount;
      const scoreB = b.topLevelComment.likeCount + b.totalReplyCount;
      
      return scoreB - scoreA;
    });
  }

  static filterRelevantThreads(threads: CommentThread[]): CommentThread[] {
    const relevantKeywords = [
      // Music terms
      'track', 'song', 'artist', 'music', 'tune', 'beat',
      'tracklist', 'playlist', 'setlist', 'mix',
      // Questions
      'what', 'who', 'name', 'title', 'id', '?',
      // Time patterns (loose check)
      ':',
      // Spanish terms
      'canción', 'música', 'artista', 'tema', 'lista',
      'qué', 'quién', 'nombre', 'título',
    ];

    return threads.filter(thread => {
      const allText = [
        thread.topLevelComment.text,
        ...thread.replies.map(r => r.text)
      ].join(' ').toLowerCase();

      // Check for music-related keywords or time patterns
      return relevantKeywords.some(keyword => allText.includes(keyword)) ||
             /\d{1,2}:\d{2}/.test(allText);
    });
  }

  private static truncateText(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
}
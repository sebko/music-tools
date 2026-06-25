import Anthropic from "@anthropic-ai/sdk";
import { TrackEntry } from "./types.js";

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
    });
  }

  async extractTracksFromComments(
    comments: string[],
    videoContext?: string
  ): Promise<TrackEntry[]> {
    const prompt = this.buildTracklistPrompt(comments, videoContext);

    try {
      const response = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== "text") {
        throw new Error("Unexpected response type from Claude");
      }

      return this.parseTracklistResponse(content.text);
    } catch (error) {
      throw new Error(`Claude API error: ${error}`);
    }
  }

  private buildTracklistPrompt(
    comments: string[],
    videoContext?: string
  ): string {
    const contextSection = videoContext
      ? `Video context: ${videoContext}\n\n`
      : "";

    return `${contextSection}Analyze these YouTube comments and extract any music tracks mentioned. Look for:

- Direct track mentions (Artist - Title, Artist: Title, etc.)
- Responses to "what song?" or "track ID?" questions
- Timestamps with track info (3:45 Artist - Title)
- Song requests and identifications
- Alternative names (e.g., "could be X or Y", "either Name1 or Name2")
- Any language (English, Spanish, Portuguese, etc.)
- Misspelled or abbreviated artist/track names
- Slang and informal references

Comments to analyze:
${comments.map((comment, i) => `${i + 1}. ${comment}`).join("\n")}

Return a JSON array of tracks found. For each track include:
- artist: The artist name (cleaned up)
- title: The track title (cleaned up) 
- timestamp: If mentioned with time (format as MM:SS or HH:MM:SS)
- confidence: Your confidence score (0.0-1.0)
- context: The original comment text where you found it
- language: Detected language code (en, es, pt, etc.)
- alternatives: Array of alternative titles if mentioned (optional, e.g., ["Alt Title 1", "Alt Title 2"])

Only include tracks you're reasonably confident about (confidence > 0.3). If no tracks found, return empty array. Do not under any circumstance create a fake track name.

Example output:
[
  {
    "artist": "Deadmau5",
    "title": "Strobe", 
    "timestamp": "03:45",
    "confidence": 0.95,
    "context": "3:45 deadmau5 - strobe is pure magic",
    "language": "en"
  },
  {
    "artist": "La Embajada Cultural",
    "title": "Cumbia Chowy",
    "confidence": 0.85,
    "context": "Cumbia chowy O Jilguerito alegre - cualquiera de esos dos nombres",
    "language": "es",
    "alternatives": ["Jilguerito Alegre"]
  }
]`;
  }

  private parseTracklistResponse(response: string): TrackEntry[] {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch =
        response.match(/```(?:json)?\n?([\s\S]*?)\n?```/) ||
        response.match(/(\[[\s\S]*\])/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;

      const tracks = JSON.parse(jsonString.trim());

      if (!Array.isArray(tracks)) {
        throw new Error("Response is not an array");
      }

      return tracks.map((track) => ({
        artist: track.artist || "",
        title: track.title || "",
        timestamp: track.timestamp || undefined,
        confidence: Math.max(0, Math.min(1, track.confidence || 0)),
        context: track.context || "",
        language: track.language || "unknown",
        alternatives: track.alternatives || undefined,
      }));
    } catch (error) {
      console.warn("Failed to parse Claude response:", error);
      return [];
    }
  }
}

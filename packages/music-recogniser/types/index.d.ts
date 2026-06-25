declare module '@trackid/music-recognition' {
  // Configuration interfaces
  export interface ServiceConfig {
    apiKey?: string;
    host?: string;
    accessKey?: string;
    accessSecret?: string;
  }

  export interface AudioConfig {
    tempDir?: string;
    segmentDuration?: number;
    overlapDuration?: number;
  }

  export interface RecognizerOptions {
    // Service configuration
    shazam?: ServiceConfig;
    audd?: ServiceConfig;
    acrcloud?: ServiceConfig;
    audio?: AudioConfig;

    // Service selection
    services?: string[];
    useAllServices?: boolean;

    // Recognition behavior
    consensusThreshold?: number;
    timeout?: number;
    quickMode?: boolean;
    confidenceThreshold?: number;

    // Audio processing
    segmentDuration?: number;
    samplePoints?: number[];
    maxAttempts?: number;

    // Output options
    includeRawResults?: boolean;
    includeAlternateMatches?: boolean;
  }

  // Result interfaces
  export interface ExternalIds {
    spotify?: string;
    apple_music?: string;
    deezer?: string;
    shazam?: string;
    napster?: string;
    [key: string]: string | undefined;
  }

  export interface RecognitionResult {
    service: string;
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    confidence: number;
    external_ids?: ExternalIds;
    genres?: string | string[];
    label?: string;
    release_date?: string;
    isrc?: string;
    processing_time_ms?: number;
    services_used?: string[];
    consensus_score?: number;
    individual_results?: Array<{
      service: string;
      confidence: number;
      title: string;
      artist: string;
    }>;
    recognized_segment?: {
      sample_point: number;
      start_time: number;
      duration: number;
    };
    alternate_matches?: RecognitionResult[];
    raw?: any;
  }

  export interface AudioSegment {
    path: string;
    startTime: number;
    endTime: number;
    duration: number;
    samplePoint?: number;
  }

  export interface UsageStats {
    timestamp: string;
    services: {
      [serviceName: string]: {
        daily_limit?: number;
        daily_usage?: number;
        monthly_limit?: number;
        monthly_usage?: number;
        error?: string;
      };
    };
  }

  export interface SearchResult {
    service: string;
    title: string;
    artist: string;
    key?: string;
    raw?: any;
  }

  // Main classes
  export class MusicRecognizer {
    constructor(options?: RecognizerOptions);
    
    identify(audioData: string | Buffer, options?: RecognizerOptions): Promise<RecognitionResult | null>;
    identifyWithService(audioData: string | Buffer, serviceName: string): Promise<RecognitionResult | null>;
    getUsageStats(): Promise<UsageStats>;
    searchTracks(query: string): Promise<SearchResult[]>;
    getTrackDetails(trackId: string, service?: string): Promise<RecognitionResult | null>;
    getAvailableServices(): Array<{ name: string; service: any }>;
  }

  export class AudioProcessor {
    constructor(options?: AudioConfig);
    
    getAudioDuration(audioPath: string): Promise<number>;
    extractSegment(audioPath: string, startTime: number, duration: number): Promise<string>;
    createStrategicSamples(audioPath: string, samplePoints?: number[], segmentDuration?: number): Promise<AudioSegment[]>;
    segmentAudio(audioPath: string): Promise<AudioSegment[]>;
    convertAudio(audioPath: string, options?: any): Promise<string>;
    cleanup(filePaths: string[]): Promise<void>;
    formatDuration(seconds: number): string;
    checkFfmpegAvailability(): Promise<boolean>;
  }

  export class ShazamService {
    constructor(options?: ServiceConfig);
    
    identifyTrack(audioData: string | Buffer): Promise<RecognitionResult | null>;
    searchTracks(query: string): Promise<SearchResult[]>;
    getTrackDetails(key: string): Promise<RecognitionResult | null>;
    isConfigured(): boolean;
  }

  export class AudDService {
    constructor(options?: ServiceConfig);
    
    identifyTrack(audioData: string | Buffer): Promise<RecognitionResult | null>;
    identifyFromUrl(url: string): Promise<RecognitionResult | null>;
    findLyrics(artist: string, title: string): Promise<{ service: string; lyrics: string; raw?: any } | null>;
    getUsage(): Promise<any>;
    isConfigured(): boolean;
  }

  export class ACRCloudService {
    constructor(options?: ServiceConfig);
    
    identifyTrack(audioData: string | Buffer): Promise<RecognitionResult | null>;
    identifyFromFingerprint(fingerprint: string): Promise<RecognitionResult | null>;
    identifyHumming(audioData: string | Buffer): Promise<RecognitionResult | null>;
    isConfigured(): boolean;
  }

  // Utility functions
  export function calculateStringSimilarity(str1: string, str2: string): number;
  export function areResultsSimilar(result1: RecognitionResult, result2: RecognitionResult, threshold?: number): boolean;
  export function crossReferenceResults(results: any[], totalServices: number, consensusThreshold?: number): RecognitionResult;
  export function groupSimilarResults(results: any[], threshold?: number): any[][];

  // Convenience functions
  export function createRecognizer(options?: RecognizerOptions): MusicRecognizer;
  export function identify(audioData: string | Buffer, options?: RecognizerOptions): Promise<RecognitionResult | null>;

  // Default export
  export default MusicRecognizer;
}
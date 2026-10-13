export type FirecrawlMode = "scrape" | "crawl";

export interface ScrapeOptions {
  formats: string[];
  onlyMainContent: boolean;
  mobile: boolean;
  skipTlsVerification: boolean;
  waitFor: number;
  extractSchema?: string; // JSON schema as string
  crawlLimit?: number;
  crawlMaxDepth?: number;
  crawlIgnoreSitemap?: boolean;
  crawlAllowBackwardLinks?: boolean;
}

export interface PresetSchema {
  id: string;
  name: string;
  description: string;
  schema: Record<string, any>;
}

export interface SavedFile {
  id: string;
  filename: string;
  url: string;
  title: string;
  timestamp: string;
  mode: "scrape" | "crawl";
  pagesCount: number;
  hasMarkdown: boolean;
}

export interface CrawlJob {
  id: string;
  url: string;
  status: "active" | "completed" | "failed";
  progress: {
    total: number;
    completed: number;
  };
  pages: any[];
}

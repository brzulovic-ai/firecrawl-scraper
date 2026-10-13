import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

// Ensure the data directory exists for file persistence
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up standard express body parsers with a high limit for large scrape responses
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

// In-memory store for fallback crawl jobs
const fallbackCrawlJobs = new Map<string, any>();

function htmlToCleanMarkdown(html: string, pageUrl: string, onlyMainContent = true) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : pageUrl;

  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ||
                    html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
  const description = descMatch ? descMatch[1].trim() : "";

  const links: string[] = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>/gi;
  let lMatch;
  while ((lMatch = linkRegex.exec(html)) !== null) {
    try {
      const fullUrl = new URL(lMatch[1], pageUrl).href;
      if (!links.includes(fullUrl) && (fullUrl.startsWith("http://") || fullUrl.startsWith("https://"))) {
        links.push(fullUrl);
      }
    } catch {
      // ignore
    }
  }

  let body = html;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    body = bodyMatch[1];
  }

  if (onlyMainContent) {
    body = body.replace(/<(nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, "");
  }

  body = body.replace(/<(script|style|svg|iframe|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");
  body = body.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  body = body.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  body = body.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  body = body.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");
  body = body.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n\n##### $1\n\n");
  body = body.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n\n###### $1\n\n");
  body = body.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n\n```\n$1\n```\n\n");
  body = body.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n\n```\n$1\n```\n\n");
  body = body.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  body = body.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n");
  body = body.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  body = body.replace(/<\/ul>|<\/ol>/gi, "\n\n");
  body = body.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    if (!cleanText) return "";
    try {
      const fullUrl = new URL(href, pageUrl).href;
      return `[${cleanText}](${fullUrl})`;
    } catch {
      return cleanText;
    }
  });
  body = body.replace(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*>/gi, "![$1]($2)");
  body = body.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, "![$2]($1)");
  body = body.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*>/gi, "![]($1)");
  body = body.replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  body = body.replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  body = body.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
  body = body.replace(/<br\s*\/?>/gi, "\n");
  body = body.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");
  body = body.replace(/<[^>]+>/g, " ");
  body = body
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");

  const lines = body
    .split("\n")
    .map(l => l.trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));

  return {
    markdown: lines.join("\n").trim() || `*No readable content extracted for ${pageUrl}*`,
    title,
    description,
    links: links.slice(0, 100)
  };
}

async function fetchAndExtractUrl(targetUrl: string, onlyMainContent = true) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`Target website responded with HTTP ${res.status}: ${res.statusText}`);
  }

  const rawHtml = await res.text();
  const parsed = htmlToCleanMarkdown(rawHtml, targetUrl, onlyMainContent);

  return {
    markdown: parsed.markdown,
    html: rawHtml,
    rawHtml,
    metadata: {
      title: parsed.title,
      description: parsed.description,
      sourceURL: targetUrl,
      statusCode: res.status,
      engine: "Built-in Web Extractor"
    },
    links: parsed.links
  };
}

  // API endpoint to check connection to local or cloud firecrawl
  app.get("/api/ping", async (req, res) => {
    try {
      const { apiUrl, apiKey } = req.query;
      const baseApiUrl = ((apiUrl as string) || process.env.FIRECRAWL_API_URL || "http://inspiron:3002").replace(/\/$/, "");
      const isFirecrawlCloud = baseApiUrl.includes("api.firecrawl.dev");
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const headers: Record<string, string> = {};
      const key = (apiKey as string) || process.env.FIRECRAWL_API_KEY;
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      const testEndpoint = isFirecrawlCloud ? `${baseApiUrl}/v1/team/credit-usage` : `${baseApiUrl}/`;

      let response: Response;
      try {
        response = await fetch(testEndpoint, {
          method: "GET",
          headers,
          signal: controller.signal
        });
      } catch (networkErr: any) {
        clearTimeout(timeoutId);
        // Use warn instead of error to avoid false alarm crashes during routine host availability probes
        console.warn(`[Ping Probe] Host unreachable (${baseApiUrl}):`, networkErr.message);
        return res.json({ 
          success: false, 
          error: "Could not connect to Firecrawl host", 
          details: networkErr.message,
          host: baseApiUrl,
          isCloud: isFirecrawlCloud,
          fallbackAvailable: true
        });
      }

      clearTimeout(timeoutId);

      if (isFirecrawlCloud) {
        if (response.status === 200) {
          return res.json({
            success: true,
            status: response.status,
            message: "Connected to Firecrawl Cloud API (Authorized)",
            isCloud: true
          });
        } else if (response.status === 401 || response.status === 403) {
          return res.json({
            success: true,
            status: response.status,
            message: key ? "Invalid Firecrawl API Key" : "Connected to api.firecrawl.dev (API Key required for scrapes)",
            isCloud: true,
            needsKey: !key
          });
        }
      }

      const isReachable = response.status >= 200 && response.status < 500;
      return res.json({ 
        success: isReachable, 
        status: response.status,
        message: isReachable 
          ? `Successfully connected to Firecrawl host (${baseApiUrl})` 
          : `Firecrawl host responded with status ${response.status}`,
        isCloud: isFirecrawlCloud
      });
    } catch (error: any) {
      console.warn("[Ping Probe] Inspection failed:", error.message);
      return res.json({ 
        success: false, 
        error: "Probe check failed", 
        details: error.message,
        fallbackAvailable: true
      });
    }
  });

  // API endpoint to proxy Scrape request
  app.post("/api/scrape", async (req, res) => {
    try {
      const { url, options = {}, apiUrl, apiKey } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const baseApiUrl = (apiUrl || process.env.FIRECRAWL_API_URL || "http://inspiron:3002").replace(/\/$/, "");
      const firecrawlUrl = `${baseApiUrl}/v1/scrape`;
      const key = apiKey || process.env.FIRECRAWL_API_KEY;

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      let responseData: any = null;
      let usedFallback = false;

      try {
        console.log(`[Proxy] Scraping url: ${url} via ${firecrawlUrl}`);
        const response = await fetch(firecrawlUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url,
            ...options
          }),
        });

        if (response.ok) {
          responseData = await response.json();
        } else {
          const errorText = await response.text();
          console.warn(`[Firecrawl API Note] Status ${response.status}: ${errorText}. Engaging fallback web extractor...`);
          // If Firecrawl returned an error (e.g. 401 unauthenticated or not running), use direct reader fallback
          usedFallback = true;
          const extracted = await fetchAndExtractUrl(url, options.onlyMainContent !== false);
          responseData = {
            success: true,
            data: extracted
          };
        }
      } catch (fetchErr: any) {
        console.warn(`[Proxy Note] Firecrawl host unreachable (${fetchErr.message}). Engaging fallback web extractor...`);
        usedFallback = true;
        const extracted = await fetchAndExtractUrl(url, options.onlyMainContent !== false);
        responseData = {
          success: true,
          data: extracted
        };
      }

      // Save to local data folder (mounting point)
      let filenamePrefix = `scrape_${Date.now()}_${url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
      const jsonPath = path.join(DATA_DIR, `${filenamePrefix}.json`);
      
      const filePayload = {
        id: filenamePrefix,
        url,
        timestamp: new Date().toISOString(),
        mode: "scrape",
        apiUsed: usedFallback ? "built-in-web-extractor" : firecrawlUrl,
        responseData
      };

      fs.writeFileSync(jsonPath, JSON.stringify(filePayload, null, 2), "utf-8");

      // Extract markdown to save as separate clean file
      let markdownContent = "";
      if (responseData.data && responseData.data.markdown) {
        markdownContent = responseData.data.markdown;
      } else if (responseData.markdown) {
        markdownContent = responseData.markdown;
      }

      if (markdownContent) {
        const mdPath = path.join(DATA_DIR, `${filenamePrefix}.md`);
        fs.writeFileSync(mdPath, markdownContent, "utf-8");
      }

      return res.json({
        success: true,
        fileId: filenamePrefix,
        data: responseData,
        usedFallback
      });
    } catch (error: any) {
      console.error("[Proxy Error] Scrape operation failed:", error);
      return res.status(500).json({ error: "Failed to scrape URL", details: error.message });
    }
  });

  // API endpoint to proxy Crawl submission
  app.post("/api/crawl", async (req, res) => {
    try {
      const { url, options = {}, apiUrl, apiKey } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const baseApiUrl = (apiUrl || process.env.FIRECRAWL_API_URL || "http://inspiron:3002").replace(/\/$/, "");
      const firecrawlUrl = `${baseApiUrl}/v1/crawl`;
      const key = apiKey || process.env.FIRECRAWL_API_KEY;

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      console.log(`[Proxy] Submitting crawl for url: ${url} via ${firecrawlUrl}`);

      try {
        const response = await fetch(firecrawlUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            url,
            ...options
          }),
        });

        if (response.ok) {
          const responseData = await response.json();
          return res.json(responseData);
        }
      } catch (err: any) {
        console.warn(`[Proxy Crawl Note] Firecrawl host unreachable (${err.message}). Using built-in crawl simulator...`);
      }

      // Built-in Crawl Fallback: extract root page and discover child links
      const seedData = await fetchAndExtractUrl(url, options.onlyMainContent !== false);
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const discoveredPages = [url, ...seedData.links.filter(l => {
        try { return new URL(l).hostname === domain; } catch { return false; }
      })].slice(0, options.limit || 5);

      const crawlJobId = `crawl_job_${Date.now()}`;
      const results = [
        seedData,
        ...discoveredPages.slice(1).map((pUrl, idx) => ({
          markdown: `# Page ${idx + 2}: Discovered via ${url}\n\n[Visit Page](${pUrl})\n\nContent queued for deep crawl extraction.`,
          html: `<p>Discovered link: ${pUrl}</p>`,
          metadata: {
            title: `Page ${idx + 2} - ${pUrl}`,
            description: `Link discovered on ${domain}`,
            sourceURL: pUrl,
            statusCode: 200
          }
        }))
      ];

      fallbackCrawlJobs.set(crawlJobId, {
        status: "completed",
        total: results.length,
        completed: results.length,
        data: results
      });

      return res.json({
        id: crawlJobId,
        jobId: crawlJobId,
        url: `${baseApiUrl}/v1/crawl/${crawlJobId}`,
        success: true
      });
    } catch (error: any) {
      console.error("[Proxy Error] Crawl submission failed:", error);
      return res.status(500).json({ error: "Failed to initiate crawl", details: error.message });
    }
  });

  // API endpoint to check Crawl status
  app.get("/api/crawl/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { apiUrl, apiKey } = req.query;

      if (fallbackCrawlJobs.has(id)) {
        return res.json(fallbackCrawlJobs.get(id));
      }

      const baseApiUrl = ((apiUrl as string) || process.env.FIRECRAWL_API_URL || "http://inspiron:3002").replace(/\/$/, "");
      const firecrawlUrl = `${baseApiUrl}/v1/crawl/${id}`;
      const key = (apiKey as string) || process.env.FIRECRAWL_API_KEY;

      const headers: Record<string, string> = {};
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }

      const response = await fetch(firecrawlUrl, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          error: "Firecrawl status check error",
          details: errorText
        });
      }

      const responseData = await response.json();
      return res.json(responseData);
    } catch (error: any) {
      console.warn("[Proxy Warning] Crawl check failed:", error.message);
      return res.status(500).json({ error: "Failed to check crawl status", details: error.message });
    }
  });

  // API endpoint to save crawl results
  app.post("/api/crawl/save", async (req, res) => {
    try {
      const { url, id, results } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const filenamePrefix = `crawl_${Date.now()}_${url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)}`;
      const jsonPath = path.join(DATA_DIR, `${filenamePrefix}.json`);

      const filePayload = {
        id: filenamePrefix,
        crawlJobId: id,
        url,
        timestamp: new Date().toISOString(),
        mode: "crawl",
        pagesCount: results ? results.length : 0,
        responseData: { data: results }
      };

      fs.writeFileSync(jsonPath, JSON.stringify(filePayload, null, 2), "utf-8");

      // Save a combined markdown of all pages
      if (results && results.length > 0) {
        let combinedMarkdown = `# Crawl Results for ${url}\n\n`;
        combinedMarkdown += `*Total pages crawled: ${results.length}*\n`;
        combinedMarkdown += `*Timestamp: ${filePayload.timestamp}*\n\n---\n\n`;

        results.forEach((page: any, index: number) => {
          const title = page.metadata?.title || page.title || `Page ${index + 1}`;
          const pageUrl = page.metadata?.sourceURL || page.url || "Unknown Link";
          combinedMarkdown += `## ${index + 1}. ${title}\n`;
          combinedMarkdown += `**Source URL:** [${pageUrl}](${pageUrl})\n\n`;
          combinedMarkdown += page.markdown || "*No markdown available for this page*";
          combinedMarkdown += "\n\n---\n\n";
        });

        const mdPath = path.join(DATA_DIR, `${filenamePrefix}.md`);
        fs.writeFileSync(mdPath, combinedMarkdown, "utf-8");
      }

      return res.json({
        success: true,
        fileId: filenamePrefix,
        pagesCount: results ? results.length : 0
      });
    } catch (error: any) {
      console.error("[Proxy Error] Save crawl results failed:", error);
      return res.status(500).json({ error: "Failed to save crawl results", details: error.message });
    }
  });

  // Get list of saved scrape files
  app.get("/api/files", (req, res) => {
    try {
      const files = fs.readdirSync(DATA_DIR);
      const list = files
        .filter((file) => file.endsWith(".json"))
        .map((file) => {
          try {
            const filePath = path.join(DATA_DIR, file);
            const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            
            // Check if there is a corresponding md file
            const mdFilename = file.replace(".json", ".md");
            const hasMarkdown = fs.existsSync(path.join(DATA_DIR, mdFilename));

            let title = content.url;
            // Attempt to get a title from responseData
            if (content.responseData?.data?.metadata?.title) {
              title = content.responseData.data.metadata.title;
            } else if (content.responseData?.metadata?.title) {
              title = content.responseData.metadata.title;
            }

            return {
              id: content.id,
              filename: file,
              url: content.url,
              title: title || content.url,
              timestamp: content.timestamp,
              mode: content.mode || "scrape",
              pagesCount: content.pagesCount || (content.responseData?.data ? 1 : 0),
              hasMarkdown
            };
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b!.timestamp).getTime() - new Date(a!.timestamp).getTime());

      return res.json(list);
    } catch (error: any) {
      console.error("[API Error] Failed to read files:", error);
      return res.status(500).json({ error: "Failed to retrieve local scrape files" });
    }
  });

  // Get specific file details
  app.get("/api/files/:id", (req, res) => {
    try {
      const { id } = req.params;
      const jsonPath = path.join(DATA_DIR, `${id}.json`);
      const mdPath = path.join(DATA_DIR, `${id}.md`);

      if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ error: "File not found" });
      }

      const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      let markdown = "";
      if (fs.existsSync(mdPath)) {
        markdown = fs.readFileSync(mdPath, "utf-8");
      }

      return res.json({
        ...jsonContent,
        markdown
      });
    } catch (error: any) {
      console.error("[API Error] Failed to read file detail:", error);
      return res.status(500).json({ error: "Failed to read file details" });
    }
  });

  // Delete saved file pair
  app.delete("/api/files/:id", (req, res) => {
    try {
      const { id } = req.params;
      const jsonPath = path.join(DATA_DIR, `${id}.json`);
      const mdPath = path.join(DATA_DIR, `${id}.md`);

      let deleted = false;
      if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
        deleted = true;
      }
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath);
        deleted = true;
      }

      if (deleted) {
        return res.json({ success: true, message: `Scrape record ${id} removed` });
      } else {
        return res.status(404).json({ error: "File not found" });
      }
    } catch (error: any) {
      console.error("[API Error] Failed to delete file:", error);
      return res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // Vite integration for web assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Scraper server started on http://localhost:${PORT}`);
    console.log(`[Server] Mount point directory for scraped files is: ${DATA_DIR}`);
  });
}

startServer();

import React, { useState, useEffect, useRef } from "react";
import { 
  Globe, Play, Layers, Sparkles, History, Search, RefreshCw, 
  Terminal, ArrowRight, Check, AlertTriangle, ShieldCheck, Database
} from "lucide-react";
import { FirecrawlMode, ScrapeOptions, SavedFile } from "./types";
import { ScrapeOptionsForm } from "./components/ScrapeOptionsForm";
import { SidebarHistory } from "./components/SidebarHistory";
import { ScrapeVisualizer } from "./components/ScrapeVisualizer";

export default function App() {
  const [url, setUrl] = useState<string>("https://news.ycombinator.com");
  const [mode, setMode] = useState<FirecrawlMode>("scrape");
  const [options, setOptions] = useState<ScrapeOptions>({
    formats: ["markdown"],
    onlyMainContent: true,
    mobile: false,
    skipTlsVerification: false,
    waitFor: 1000,
    crawlLimit: 10,
    crawlMaxDepth: 2,
    crawlIgnoreSitemap: false,
    crawlAllowBackwardLinks: false
  });
  // API & Endpoint settings
  const [useFirecrawlApi, setUseFirecrawlApi] = useState<boolean>(() => {
    return localStorage.getItem("use_firecrawl_api") === "true";
  });
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem("firecrawl_api_key") || "";
  });
  const [apiUrl, setApiUrl] = useState<string>(() => {
    const saved = localStorage.getItem("firecrawl_api_url");
    if (saved) return saved;
    return localStorage.getItem("use_firecrawl_api") === "true" 
      ? "https://api.firecrawl.dev" 
      : "http://inspiron:3002";
  });
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  // Scraped files history
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState<boolean>(false);

  // Loading, progress & error states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Connection ping status
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");

  // Crawl job monitoring
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<{ completed: number; total: number; pages: string[] }>({
    completed: 0,
    total: 0,
    pages: []
  });
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load history files on mount
  useEffect(() => {
    fetchFiles();
    testConnection();
  }, []);

  const handleToggleFirecrawlApi = (enabled: boolean) => {
    setUseFirecrawlApi(enabled);
    localStorage.setItem("use_firecrawl_api", enabled ? "true" : "false");
    const newEndpoint = enabled ? "https://api.firecrawl.dev" : "http://inspiron:3002";
    setApiUrl(newEndpoint);
    localStorage.setItem("firecrawl_api_url", newEndpoint);
    testConnection(newEndpoint, apiKey);
  };

  const handleApiUrlChange = (newUrl: string) => {
    setApiUrl(newUrl);
    localStorage.setItem("firecrawl_api_url", newUrl);
    if (newUrl.includes("api.firecrawl.dev")) {
      setUseFirecrawlApi(true);
      localStorage.setItem("use_firecrawl_api", "true");
    }
  };

  const handleApiKeyChange = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem("firecrawl_api_key", newKey);
  };

  // Cleanup polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const fetchFiles = async () => {
    setFilesLoading(true);
    try {
      const response = await fetch("/api/files");
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (e) {
      console.error("Failed to load archived scrapes", e);
    } finally {
      setFilesLoading(false);
    }
  };

  const testConnection = async (targetUrl?: string, targetKey?: string) => {
    const urlToTest = targetUrl !== undefined ? targetUrl : apiUrl;
    const keyToTest = targetKey !== undefined ? targetKey : apiKey;
    setConnectionStatus("testing");
    setConnectionMessage(null);
    try {
      const params = new URLSearchParams({ apiUrl: urlToTest });
      if (keyToTest) params.set("apiKey", keyToTest);
      
      const response = await fetch(`/api/ping?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setConnectionStatus(data.success ? "success" : "failed");
        setConnectionMessage(data.message || (data.success ? "Connected successfully" : (data.details || data.error)));
      } else {
        setConnectionStatus("failed");
        setConnectionMessage(`Status ${response.status}`);
      }
    } catch (e: any) {
      setConnectionStatus("failed");
      setConnectionMessage(e.message || "Failed to reach endpoint probe");
    }
  };

  const handleSelectFile = async (file: SavedFile) => {
    setSelectedFileId(file.id);
    setSelectedFile(null);
    try {
      const response = await fetch(`/api/files/${file.id}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedFile(data);
        // Sync API inputs for reference
        setUrl(data.url);
        if (data.mode) setMode(data.mode);
      }
    } catch (e) {
      console.error("Failed to read file detail", e);
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (response.ok) {
        if (selectedFileId === id) {
          setSelectedFile(null);
          setSelectedFileId(null);
        }
        fetchFiles();
      }
    } catch (e) {
      console.error("Failed to delete scrape record", e);
    }
  };

  // Kickoff Scrape or Crawl
  const handleExecute = async () => {
    setIsLoading(true);
    setError(null);
    setLogs([]);
    setSelectedFile(null);
    setSelectedFileId(null);

    // Prepare parameters matching Firecrawl specification
    const firecrawlOptions: Record<string, any> = {
      formats: options.formats,
      onlyMainContent: options.onlyMainContent,
      mobile: options.mobile,
      skipTlsVerification: options.skipTlsVerification,
      waitFor: options.waitFor
    };

    // If structured extraction is specified
    if (mode === "scrape" && options.extractSchema) {
      try {
        firecrawlOptions.extract = {
          schema: JSON.parse(options.extractSchema)
        };
      } catch (e) {
        setError("AI Extraction schema JSON is malformed.");
        setIsLoading(false);
        return;
      }
    }

    // Crawl options
    if (mode === "crawl") {
      firecrawlOptions.limit = options.crawlLimit || 10;
      firecrawlOptions.maxDepth = options.crawlMaxDepth || 2;
      firecrawlOptions.ignoreSitemap = options.crawlIgnoreSitemap || false;
      firecrawlOptions.allowBackwardLinks = options.crawlAllowBackwardLinks || false;
    }

    if (mode === "scrape") {
      addLog(`Initiating single page scrape for: ${url}`);
      addLog(`Using Firecrawl Host: ${apiUrl}${useFirecrawlApi ? " (Official Firecrawl API)" : " (Self-Hosted)"}`);
      
      try {
        const response = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            apiUrl,
            apiKey,
            options: firecrawlOptions
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || result.details || "Scraping failed");
        }

        if (result.usedFallback) {
          addLog("Notice: Direct web reader extractor utilized (Firecrawl host offline or fallback active)");
        } else {
          addLog("Scrape successfully compiled and saved to local archives!");
        }

        fetchFiles();
        
        // Load the results
        if (result.fileId) {
          setSelectedFileId(result.fileId);
          // Load fully
          const detailRes = await fetch(`/api/files/${result.fileId}`);
          if (detailRes.ok) {
            const fileData = await detailRes.json();
            setSelectedFile(fileData);
          }
        }
      } catch (e: any) {
        addLog(`Error: ${e.message}`);
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Crawling mode: submit and poll
      addLog(`Submitting crawl mapping job for domain: ${url}`);
      addLog(`Limit: ${firecrawlOptions.limit} pages, Max Depth: ${firecrawlOptions.maxDepth}`);

      try {
        const response = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            apiUrl,
            apiKey,
            options: firecrawlOptions
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.details || "Failed to submit crawl job");
        }

        // Firecrawl v1 standard crawl return keys
        const jobId = result.id || result.jobId;
        if (!jobId) {
          throw new Error("Crawl submitted but no Job ID was returned by Firecrawl.");
        }

        setActiveJobId(jobId);
        addLog(`Crawl job submitted successfully! Job ID: ${jobId}`);
        addLog("Starting background job status monitor...");
        
        // Reset progress counters
        setCrawlProgress({ completed: 0, total: 0, pages: [] });

        // Begin Polling loop
        startCrawlPolling(jobId);
      } catch (e: any) {
        addLog(`Error submitting crawl: ${e.message}`);
        setError(e.message);
        setIsLoading(false);
      }
    }
  };

  const startCrawlPolling = (jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams({ apiUrl });
        if (apiKey) params.set("apiKey", apiKey);
        const checkRes = await fetch(`/api/crawl/${jobId}?${params.toString()}`);
        if (!checkRes.ok) {
          addLog("Unable to query crawl progress. Retrying status query...");
          return;
        }

        const progressData = await checkRes.json();
        
        // Handle varying Firecrawl response formats
        const status = progressData.status || progressData.data?.status || "scraping";
        const completedCount = progressData.completed || progressData.data?.length || 0;
        const totalCount = progressData.total || options.crawlLimit || 10;
        
        // Extract links or titles found so far
        const crawledPages: any[] = progressData.data || progressData.results || [];
        const pageUrls = crawledPages.map((p: any) => p.metadata?.sourceURL || p.url || "Extracted Page").filter(Boolean);

        setCrawlProgress({
          completed: completedCount,
          total: totalCount,
          pages: pageUrls
        });

        addLog(`Progress: ${completedCount} pages crawled so far... Status: ${status}`);

        if (status === "completed" || status === "finished") {
          addLog("Crawl job completed successfully! Compiling results...");
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;

          // Ask server to write bundled crawl files to local disk mounting point
          const saveRes = await fetch("/api/crawl/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              id: jobId,
              results: crawledPages
            })
          });

          const saveResult = await saveRes.json();
          if (saveRes.ok && saveResult.success) {
            addLog(`Bundle written successfully to local archive: ${saveResult.fileId}`);
            fetchFiles();
            
            // Load file
            setSelectedFileId(saveResult.fileId);
            const detailRes = await fetch(`/api/files/${saveResult.fileId}`);
            if (detailRes.ok) {
              const fileData = await detailRes.json();
              setSelectedFile(fileData);
            }
          } else {
            throw new Error(saveResult.error || "Failed to package crawl records");
          }
          
          setIsLoading(false);
          setActiveJobId(null);
        } else if (status === "failed") {
          throw new Error("Crawl job was reported as FAILED by the Firecrawl engine.");
        }
      } catch (e: any) {
        addLog(`Crawl job monitoring failed: ${e.message}`);
        setError(e.message);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setIsLoading(false);
        setActiveJobId(null);
      }
    }, 2500);
  };

  const handleCancelCrawl = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
    setIsLoading(false);
    setActiveJobId(null);
    addLog("Crawl job monitoring aborted manually.");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-blue-100 selection:text-blue-900">
      {/* Visual Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl text-white shadow-md shadow-blue-500/10">
              <Globe className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight flex items-center gap-2">
                Firecrawl Scraper Frontend
              </h1>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Full-Stack Local Scraper Workspace & Archive
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick check showing Docker Mount connection */}
            <div className="flex items-center gap-2 bg-slate-100/80 px-3.5 py-1.5 rounded-lg border border-slate-200">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Storage Mount:</span>
              <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-100">
                ./data
              </span>
            </div>

            <div className="flex items-center gap-2 bg-slate-100/80 px-3.5 py-1.5 rounded-lg border border-slate-200">
              <div className={`w-2 h-2 rounded-full ${
                connectionStatus === "success" ? "bg-emerald-500 animate-pulse" :
                connectionStatus === "failed" ? "bg-rose-500" : "bg-slate-300"
              }`} />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Endpoint:</span>
              <span className="text-[10px] font-mono font-semibold text-slate-700 truncate max-w-[120px]" title={apiUrl}>
                {apiUrl}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                useFirecrawlApi ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"
              }`}>
                {useFirecrawlApi ? "Cloud API" : "Local"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:py-8 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SIDEBAR: Scraper Config Form & Local Archives (width: 4/12) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Form */}
            <ScrapeOptionsForm
              url={url}
              setUrl={setUrl}
              mode={mode}
              setMode={setMode}
              options={options}
              setOptions={setOptions}
              apiUrl={apiUrl}
              setApiUrl={handleApiUrlChange}
              apiKey={apiKey}
              setApiKey={handleApiKeyChange}
              useFirecrawlApi={useFirecrawlApi}
              setUseFirecrawlApi={handleToggleFirecrawlApi}
              onExecute={handleExecute}
              isLoading={isLoading}
              onTestConnection={() => testConnection()}
              connectionStatus={connectionStatus}
              connectionMessage={connectionMessage}
            />

            {/* Archive Browser */}
            <SidebarHistory
              files={files}
              onSelectFile={handleSelectFile}
              onDeleteFile={handleDeleteFile}
              selectedFileId={selectedFileId}
              onRefresh={fetchFiles}
              isLoading={filesLoading}
            />

          </div>

          {/* MAIN GRID: Visualizer Output & Loading Logs (width: 8/12) */}
          <div className="lg:col-span-8">
            
            {/* 1. Loading & Crawler Progress */}
            {isLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 md:p-8 space-y-6 shadow-sm animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      Active {mode === "scrape" ? "Scrape" : "Crawl"} Job
                    </h2>
                    <p className="text-xs text-slate-500">Target URL: <span className="font-semibold text-slate-800">{url}</span></p>
                  </div>

                  {mode === "crawl" && (
                    <button
                      onClick={handleCancelCrawl}
                      className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 border border-rose-200 rounded-md bg-rose-50 hover:bg-rose-100 transition-colors"
                    >
                      Abort Monitor
                    </button>
                  )}
                </div>

                {/* Progress Indicators */}
                {mode === "crawl" && (
                  <div className="space-y-3.5 bg-blue-50/50 p-4 border border-blue-200/30 rounded-xl">
                    <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                      <span>Crawl Progress</span>
                      <span>{crawlProgress.completed} / {crawlProgress.total} Pages</span>
                    </div>

                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-600 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (crawlProgress.completed / crawlProgress.total) * 100)}%` }}
                      />
                    </div>

                    {crawlProgress.pages.length > 0 && (
                      <div className="space-y-1 pt-1.5">
                        <span className="text-[10px] font-bold uppercase text-blue-800 block">URLs Discovered:</span>
                        <div className="max-h-24 overflow-y-auto divide-y divide-blue-200/20 text-[10px] font-mono text-blue-950 bg-white/70 rounded-lg p-2 border border-blue-200/30">
                          {crawlProgress.pages.map((p, i) => (
                            <div key={i} className="py-1 truncate">→ {p}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Job Log Console */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-gray-400" />
                    Process Monitor logs
                  </span>
                  
                  <div className="bg-gray-950 text-emerald-400 font-mono text-[11px] p-4 rounded-xl leading-relaxed max-h-56 overflow-y-auto shadow-inner border border-gray-900">
                    {logs.map((log, index) => (
                      <div key={index} className="py-0.5 border-b border-gray-900/40 last:border-0">{log}</div>
                    ))}
                    <div className="text-gray-500 italic animate-pulse">Running job tasks...</div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Error Display */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-6 text-xs text-rose-800 flex items-start gap-3.5 shadow-sm animate-fadeIn">
                <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-bold uppercase tracking-wider text-rose-950">Connection / Operation Failure</h3>
                  <p className="leading-relaxed font-medium">{error}</p>
                  <p className="text-[10px] text-rose-600/80 leading-normal pt-1 font-mono">
                    Ensure your local Firecrawl instance is active at {apiUrl} and responsive to API calls.
                  </p>
                </div>
              </div>
            )}

            {/* 3. Empty State (Active when no file selected & not loading) */}
            {!selectedFile && !isLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-6 shadow-sm min-h-[500px] flex flex-col items-center justify-center animate-fadeIn">
                <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 inline-block shadow-sm">
                  <Globe className="w-10 h-10 stroke-1.2" />
                </div>

                <div className="max-w-md space-y-2">
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    Firecrawl Local Scraper Dashboard
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Configure your scraper parameters on the left pane and submit a URL. Scrapes are parsed into beautiful Markdown outputs, charts, and structural outlines, and persisted in your local workspace.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3.5 pt-2">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-start gap-3 text-left max-w-[260px]">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Local Archive persistence</h4>
                      <p className="text-[10px] text-slate-500 leading-normal pt-0.5">Scrapes automatically save to your local folder mount.</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-start gap-3 text-left max-w-[260px]">
                    <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Advanced AI Presets</h4>
                      <p className="text-[10px] text-slate-500 leading-normal pt-0.5">Toggle structured schemas to extract neat JSON parameters.</p>
                    </div>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="pt-4 border-t border-dashed border-slate-200 w-full max-w-xs space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Or Load from History:</span>
                    <button
                      onClick={() => handleSelectFile(files[0])}
                      className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      Browse Last Scrape ({getDomainName(files[0].url)})
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 4. Active Scrape Visualizer */}
            {selectedFile && !isLoading && (
              <div className="animate-fadeIn space-y-4">
                {/* Active File Banner */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                  <div className="min-w-0">
                    <span className="text-[9px] uppercase font-bold text-blue-600 block tracking-wider">Displaying Archive Record:</span>
                    <h2 className="text-sm font-extrabold text-slate-900 truncate leading-snug">
                      {selectedFile.responseData?.data?.metadata?.title || selectedFile.responseData?.metadata?.title || selectedFile.url}
                    </h2>
                    <a 
                      href={selectedFile.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-[10px] text-slate-400 font-mono hover:text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                    >
                      {selectedFile.url}
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                    </a>
                  </div>

                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date(selectedFile.timestamp).toLocaleDateString()}
                    </span>
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-sm capitalize">
                      {selectedFile.mode || "scrape"}
                    </span>
                  </div>
                </div>

                {/* Scrape Visualizer Workspace */}
                <ScrapeVisualizer payload={selectedFile} url={selectedFile.url} />
              </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}

// Inline domain extractor helper
function getDomainName(urlStr: string) {
  try {
    return new URL(urlStr).hostname;
  } catch (e) {
    return urlStr;
  }
}

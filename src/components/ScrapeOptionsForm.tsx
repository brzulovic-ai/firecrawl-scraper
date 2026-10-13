import React, { useState } from "react";
import { Sliders, Settings, Globe, Play, Layers, Sparkles, AlertCircle, RefreshCw, Key, Check, AlertTriangle } from "lucide-react";
import { FirecrawlMode, ScrapeOptions, PresetSchema } from "../types";

interface ScrapeOptionsFormProps {
  url: string;
  setUrl: (url: string) => void;
  mode: FirecrawlMode;
  setMode: (mode: FirecrawlMode) => void;
  options: ScrapeOptions;
  setOptions: React.Dispatch<React.SetStateAction<ScrapeOptions>>;
  apiUrl: string;
  setApiUrl: (url: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  useFirecrawlApi: boolean;
  setUseFirecrawlApi: (enabled: boolean) => void;
  onExecute: () => void;
  isLoading: boolean;
  onTestConnection: () => Promise<void>;
  connectionStatus: "idle" | "testing" | "success" | "failed";
  connectionMessage?: string | null;
}

export const PRESET_SCHEMAS: PresetSchema[] = [
  {
    id: "none",
    name: "Standard Scrape (None)",
    description: "Extract raw text, markdown, HTML, or links without AI formatting.",
    schema: {}
  },
  {
    id: "product",
    name: "E-Commerce Product Info",
    description: "Extract product name, pricing, stock status, ratings, and features.",
    schema: {
      type: "object",
      properties: {
        productName: { type: "string", description: "The name of the product" },
        price: { type: "string", description: "The current pricing or cost" },
        currency: { type: "string", description: "Currency of the price (e.g. USD, EUR)" },
        description: { type: "string", description: "Primary description of the item" },
        inStock: { type: "boolean", description: "Is this item currently in stock" },
        features: { type: "array", items: { type: "string" }, description: "Key features or specifications listed" },
        rating: { type: "string", description: "Star rating or user score (e.g., 4.5/5)" }
      },
      required: ["productName", "price"]
    }
  },
  {
    id: "article",
    name: "News Article / Blog Post",
    description: "Extract author, title, publish date, summary, and key highlights.",
    schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the article" },
        author: { type: "string", description: "Name of the writer or publisher" },
        publishedDate: { type: "string", description: "When the article was published" },
        summary: { type: "string", description: "A concise 2-3 sentence overview" },
        category: { type: "string", description: "The topical category" },
        keyTakeaways: { type: "array", items: { type: "string" }, description: "List of key points or bullet lessons" }
      },
      required: ["title", "summary"]
    }
  },
  {
    id: "job",
    name: "Job Board Listing",
    description: "Extract job title, hiring company, salary boundaries, and skills.",
    schema: {
      type: "object",
      properties: {
        jobTitle: { type: "string", description: "The designation / title of the role" },
        company: { type: "string", description: "Name of the hiring company" },
        location: { type: "string", description: "Workplace location (e.g., Remote, NY)" },
        salaryRange: { type: "string", description: "Offered compensation bracket" },
        experienceLevel: { type: "string", description: "Junior, Senior, etc." },
        responsibilities: { type: "array", items: { type: "string" }, description: "Core tasks and duties" },
        qualifications: { type: "array", items: { type: "string" }, description: "Required skills, languages, or tools" }
      },
      required: ["jobTitle", "company"]
    }
  }
];

export function ScrapeOptionsForm({
  url,
  setUrl,
  mode,
  setMode,
  options,
  setOptions,
  apiUrl,
  setApiUrl,
  apiKey,
  setApiKey,
  useFirecrawlApi,
  setUseFirecrawlApi,
  onExecute,
  isLoading,
  onTestConnection,
  connectionStatus,
  connectionMessage
}: ScrapeOptionsFormProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("none");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [customSchemaJson, setCustomSchemaJson] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleFormatChange = (format: string) => {
    setOptions(prev => {
      const isSelected = prev.formats.includes(format);
      const newFormats = isSelected 
        ? prev.formats.filter(f => f !== format)
        : [...prev.formats, format];
      
      // Keep at least one format selected
      return {
        ...prev,
        formats: newFormats.length > 0 ? newFormats : [format]
      };
    });
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    setJsonError(null);

    if (presetId === "none") {
      setOptions(prev => {
        const { extractSchema, ...rest } = prev;
        return rest;
      });
    } else {
      const preset = PRESET_SCHEMAS.find(p => p.id === presetId);
      if (preset) {
        const schemaString = JSON.stringify(preset.schema, null, 2);
        setCustomSchemaJson(schemaString);
        setOptions(prev => ({
          ...prev,
          extractSchema: schemaString
        }));
      }
    }
  };

  const handleCustomSchemaChange = (text: string) => {
    setCustomSchemaJson(text);
    try {
      if (text.trim() === "") {
        setJsonError(null);
        setOptions(prev => {
          const { extractSchema, ...rest } = prev;
          return rest;
        });
        return;
      }

      const parsed = JSON.parse(text);
      setJsonError(null);
      setOptions(prev => ({
        ...prev,
        extractSchema: JSON.stringify(parsed)
      }));
    } catch (e: any) {
      setJsonError(`Invalid JSON: ${e.message}`);
    }
  };

  const preset = PRESET_SCHEMAS.find(p => p.id === selectedPresetId);

  return (
    <div id="scrape-options-form-root" className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Title / Section Header */}
      <div className="bg-slate-50 border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Configure Scrape</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">API:</span>
          <span className={`inline-block w-2 h-2 rounded-full ${
            connectionStatus === "success" ? "bg-emerald-500 animate-pulse" :
            connectionStatus === "failed" ? "bg-rose-500" : "bg-slate-300"
          }`} />
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Connection Setup */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Firecrawl Host Endpoint
            </label>
            {/* Small checkbox to switch to Firecrawl's API endpoint */}
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700 hover:text-blue-600 transition-colors select-none">
              <input
                type="checkbox"
                checked={useFirecrawlApi}
                onChange={(e) => setUseFirecrawlApi(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 accent-blue-600 cursor-pointer"
              />
              <span className="text-[11px] font-semibold">Use Firecrawl API</span>
            </label>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={useFirecrawlApi ? "https://api.firecrawl.dev" : "http://inspiron:3002"}
                className="w-full text-xs rounded-lg border border-slate-300 pl-9 pr-3 py-2 bg-slate-50 text-slate-800 font-mono focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <button
              type="button"
              onClick={onTestConnection}
              disabled={connectionStatus === "testing"}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 bg-white disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
            >
              {connectionStatus === "testing" ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : (
                "Ping"
              )}
            </button>
          </div>

          {/* Quick presets for convenience */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-medium">Quick switch:</span>
            <button
              type="button"
              onClick={() => {
                setUseFirecrawlApi(false);
                setApiUrl("http://localhost:3002");
              }}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                apiUrl === "http://localhost:3002" && !useFirecrawlApi
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              localhost:3002
            </button>
            <button
              type="button"
              onClick={() => {
                setUseFirecrawlApi(false);
                setApiUrl("http://inspiron:3002");
              }}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                apiUrl === "http://inspiron:3002" && !useFirecrawlApi
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              inspiron:3002
            </button>
            <button
              type="button"
              onClick={() => {
                setUseFirecrawlApi(true);
                setApiUrl("https://api.firecrawl.dev");
              }}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                useFirecrawlApi || apiUrl === "https://api.firecrawl.dev"
                  ? "bg-blue-50 border-blue-300 text-blue-700 font-bold"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              api.firecrawl.dev
            </button>
          </div>

          {/* Firecrawl API Key input (shown when using cloud API or configured) */}
          {useFirecrawlApi && (
            <div className="space-y-1.5 pt-1 animate-fadeIn bg-blue-50/50 p-2.5 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-blue-900 flex items-center gap-1">
                  <Key className="w-3 h-3 text-blue-600" />
                  Firecrawl API Key
                </span>
                <a
                  href="https://firecrawl.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  Get API Key →
                </a>
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="fc-xxxxxxxxxxxxxxxxxxxx"
                className="w-full text-xs rounded-lg border border-blue-200 px-3 py-1.5 bg-white font-mono text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
              <p className="text-[9px] text-blue-700/80 leading-normal">
                Leave empty to test endpoint connectivity or fallback to built-in extractor.
              </p>
            </div>
          )}

          {/* Connection Status / Notice Pill */}
          {connectionStatus === "failed" && (
            <div className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200/80 rounded-lg p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-[11px]">Host Unreachable ({apiUrl})</p>
                <p className="text-[10px] text-amber-700 leading-normal">
                  {useFirecrawlApi
                    ? "Check your internet connection or Firecrawl API key. Scrapes will automatically fall back to the built-in reader."
                    : "Local Firecrawl instance is offline. Check the 'Use Firecrawl API' checkbox above, or scrapes will automatically use the built-in reader."}
                </p>
              </div>
            </div>
          )}

          {connectionStatus === "success" && (
            <div className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span className="text-[10px] font-medium leading-tight">{connectionMessage || "Endpoint is reachable and active."}</span>
            </div>
          )}
        </div>

        {/* Target URL */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Scrape Target URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://news.ycombinator.com"
            className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2.5 text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-hidden shadow-xs bg-slate-50 focus:bg-white"
          />
        </div>

        {/* Mode Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Extraction Job Type</label>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("scrape")}
              className={`py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === "scrape"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/50 font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Single Page (Scrape)
            </button>
            <button
              type="button"
              onClick={() => setMode("crawl")}
              className={`py-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === "crawl"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/50 font-semibold"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Whole Site (Crawl)
            </button>
          </div>
        </div>

        {/* Output Formats */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Requested Document Formats</label>
          <div className="grid grid-cols-2 gap-2.5">
            {["markdown", "html", "rawHtml", "screenshot", "links"].map(fmt => {
              const checked = options.formats.includes(fmt);
              return (
                <label
                  key={fmt}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                    checked
                      ? "border-blue-500 bg-blue-50/50 text-blue-900 font-semibold"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleFormatChange(fmt)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 accent-blue-600"
                  />
                  <span className="capitalize">{fmt === "rawHtml" ? "Raw HTML" : fmt}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Crawl Specific Constraints */}
        {mode === "crawl" && (
          <div className="p-3 bg-blue-50/40 border border-blue-200/40 rounded-xl space-y-4 animate-fadeIn">
            <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5 border-b border-blue-200/30 pb-1.5 uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              Crawl Boundaries
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-blue-900 uppercase block">Max Pages</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={options.crawlLimit || 10}
                  onChange={(e) => setOptions(prev => ({ ...prev, crawlLimit: parseInt(e.target.value) || 10 }))}
                  className="w-full text-xs rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-blue-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-blue-900 uppercase block">Max Depth</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={options.crawlMaxDepth || 2}
                  onChange={(e) => setOptions(prev => ({ ...prev, crawlMaxDepth: parseInt(e.target.value) || 2 }))}
                  className="w-full text-xs rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-blue-900 focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer text-blue-950 font-medium">
                <input
                  type="checkbox"
                  checked={options.crawlIgnoreSitemap || false}
                  onChange={(e) => setOptions(prev => ({ ...prev, crawlIgnoreSitemap: e.target.checked }))}
                  className="rounded border-blue-200 text-blue-600 accent-blue-600"
                />
                <span>Ignore Sitemap</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer text-blue-950 font-medium">
                <input
                  type="checkbox"
                  checked={options.crawlAllowBackwardLinks || false}
                  onChange={(e) => setOptions(prev => ({ ...prev, crawlAllowBackwardLinks: e.target.checked }))}
                  className="rounded border-blue-200 text-blue-600 accent-blue-600"
                />
                <span>Allow Backward Links</span>
              </label>
            </div>
          </div>
        )}

        {/* Structured AI Extraction (Only available for single page scrape) */}
        {mode === "scrape" && (
          <div className="border border-slate-200 rounded-xl p-3.5 space-y-3.5 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Structured AI Extraction
              </h3>
              {selectedPresetId !== "none" && (
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  AI Active
                </span>
              )}
            </div>

            <div className="space-y-2">
              <select
                value={selectedPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-700 focus:border-blue-500 focus:outline-hidden"
              >
                {PRESET_SCHEMAS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {preset && preset.id !== "none" && (
                <p className="text-[10px] text-slate-500 leading-normal pl-1">
                  {preset.description}
                </p>
              )}
            </div>

            {selectedPresetId !== "none" && (
              <div className="space-y-2 animate-fadeIn pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600 uppercase">Schema (JSON Schema Structure)</span>
                  <button
                    type="button"
                    onClick={() => {
                      // Toggle editability by changing preset ID to custom
                      if (selectedPresetId !== "custom") {
                        setSelectedPresetId("custom");
                      }
                    }}
                    className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Customize Keys
                  </button>
                </div>
                
                <textarea
                  value={customSchemaJson}
                  onChange={(e) => handleCustomSchemaChange(e.target.value)}
                  rows={6}
                  placeholder="Paste custom JSON Schema here..."
                  className="w-full text-[10px] font-mono rounded-lg border border-slate-300 p-2.5 bg-slate-950 text-emerald-400 focus:outline-hidden focus:border-blue-500"
                />
                
                {jsonError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2 rounded-lg text-[10px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <span>{jsonError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Toggle Advanced Configuration */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 py-1 font-semibold uppercase tracking-wider select-none cursor-pointer"
          >
            <Settings className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-90 text-blue-600" : ""}`} />
            {showAdvanced ? "Hide Advanced Settings" : "Show Advanced Settings"}
          </button>

          {showAdvanced && (
            <div className="pt-3.5 space-y-4 border-t border-dashed border-slate-200 mt-2.5 animate-fadeIn">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Javascript Render Wait</label>
                  <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                    {options.waitFor} ms
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="500"
                  value={options.waitFor}
                  onChange={(e) => setOptions(prev => ({ ...prev, waitFor: parseInt(e.target.value) }))}
                  className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
                <p className="text-[9px] text-slate-400 leading-normal">
                  Wait time for dynamic content rendering (Single Page only).
                </p>
              </div>

              <div className="space-y-2 pt-1.5">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={options.onlyMainContent}
                    onChange={(e) => setOptions(prev => ({ ...prev, onlyMainContent: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 accent-blue-600"
                  />
                  <span>Extract Only Main Content</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={options.mobile}
                    onChange={(e) => setOptions(prev => ({ ...prev, mobile: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 accent-blue-600"
                  />
                  <span>Emulate Mobile Device</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={options.skipTlsVerification}
                    onChange={(e) => setOptions(prev => ({ ...prev, skipTlsVerification: e.target.checked }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 accent-blue-600"
                  />
                  <span>Skip TLS Verification</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Execute Button */}
        <button
          type="button"
          onClick={onExecute}
          disabled={isLoading || !url || (mode === "scrape" && !!jsonError)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-md disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Running {mode}...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white text-white" />
              <span>Run Firecrawl Scraper</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

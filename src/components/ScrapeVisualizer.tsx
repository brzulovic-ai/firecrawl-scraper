import React, { useState, useMemo } from "react";
import { 
  FileText, Link2, Key, Info, BookOpen, Clock, Layers, Image as ImageIcon, 
  Sparkles, Check, ChevronRight, BarChart3, Search, ExternalLink 
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie 
} from "recharts";
import { MarkdownViewer } from "./MarkdownViewer";

interface ScrapeVisualizerProps {
  payload: any;
  url: string;
}

export function ScrapeVisualizer({ payload, url }: ScrapeVisualizerProps) {
  const [activeTab, setActiveTab] = useState<"dashboard" | "markdown" | "outline" | "links" | "structured" | "metadata">("dashboard");
  const [linksFilter, setLinksFilter] = useState<string>("");

  // Extract core response elements
  const scrapeData = useMemo(() => {
    if (!payload) return null;
    // Handle both direct and enveloped structures
    if (payload.responseData?.data) {
      return payload.responseData.data;
    }
    if (payload.data) {
      return payload.data;
    }
    return payload;
  }, [payload]);

  const markdown = useMemo(() => {
    if (!scrapeData) return "";
    return scrapeData.markdown || scrapeData.content || payload.markdown || "";
  }, [scrapeData, payload]);

  const rawHtml = useMemo(() => {
    if (!scrapeData) return "";
    return scrapeData.html || scrapeData.rawHtml || "";
  }, [scrapeData]);

  const metadata = useMemo(() => {
    if (!scrapeData) return {};
    return scrapeData.metadata || {};
  }, [scrapeData]);

  // Compute stats on the scraped markdown
  const stats = useMemo(() => {
    if (!markdown) return { words: 0, readingTime: 0, characters: 0, lines: 0, headingCount: 0, mediaCount: 0 };
    
    const cleanMd = markdown.trim();
    const characters = cleanMd.length;
    const lines = cleanMd.split("\n").length;
    
    const words = cleanMd.split(/\s+/).filter(w => w.length > 0).length;
    const readingTime = Math.max(1, Math.ceil(words / 200)); // ~200 WPM
    
    // Count headings
    const headingMatches = cleanMd.match(/^#{1,6}\s+.+$/gm);
    const headingCount = headingMatches ? headingMatches.length : 0;

    // Count images
    const imageMatches = cleanMd.match(/!\[.*?\]\(.*?\)/g);
    const imageCount = imageMatches ? imageMatches.length : 0;

    return {
      words,
      readingTime,
      characters,
      lines,
      headingCount,
      mediaCount: imageCount
    };
  }, [markdown]);

  // Parse Headings to construct an interactive Table of Contents
  const headings = useMemo(() => {
    if (!markdown) return [];
    const lines = markdown.split("\n");
    const foundHeadings: { level: number; text: string; lineNo: number }[] = [];
    
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        foundHeadings.push({
          level: match[1].length,
          text: match[2].trim(),
          lineNo: index + 1
        });
      }
    });
    return foundHeadings;
  }, [markdown]);

  // Compile Links from metadata and markdown
  const linksList = useMemo(() => {
    // 1. Gather links from Firecrawl metadata
    const metaLinks = metadata.links || scrapeData?.links || [];
    const uniqueLinksMap = new Map<string, string>(); // url -> text

    metaLinks.forEach((link: any) => {
      if (typeof link === "string") {
        uniqueLinksMap.set(link, "Link");
      } else if (link && typeof link === "object" && link.href) {
        uniqueLinksMap.set(link.href, link.text || "Link");
      }
    });

    // 2. Parse from markdown if links are sparse
    if (uniqueLinksMap.size === 0 && markdown) {
      const mdLinkRegex = /\[(.*?)\]\((.*?)\)/g;
      let match;
      while ((match = mdLinkRegex.exec(markdown)) !== null) {
        const text = match[1].trim();
        const href = match[2].trim();
        if (href.startsWith("http") && !uniqueLinksMap.has(href)) {
          uniqueLinksMap.set(href, text || "Anchor Link");
        }
      }
    }

    const baseHost = (() => {
      try {
        return new URL(url).hostname;
      } catch (e) {
        return "";
      }
    })();

    return Array.from(uniqueLinksMap.entries()).map(([href, text]) => {
      let isExternal = true;
      try {
        const linkUrl = new URL(href, url);
        if (baseHost && linkUrl.hostname.includes(baseHost)) {
          isExternal = false;
        }
      } catch (e) {}

      return {
        href,
        text: text.substring(0, 100),
        isExternal
      };
    });
  }, [metadata, scrapeData, markdown, url]);

  // Filter links
  const filteredLinks = useMemo(() => {
    if (!linksFilter) return linksList;
    const term = linksFilter.toLowerCase();
    return linksList.filter(l => 
      l.href.toLowerCase().includes(term) || 
      l.text.toLowerCase().includes(term)
    );
  }, [linksList, linksFilter]);

  // Aggregate stats for Charts
  const chartData = useMemo(() => {
    if (headings.length === 0) {
      return [
        { name: "Total Words", value: stats.words / 10 },
        { name: "Total Lines", value: stats.lines },
        { name: "Total Links", value: linksList.length },
        { name: "Total Images", value: stats.mediaCount * 5 }
      ];
    }

    // Measure word distributions of sections (distance between headings)
    const lines = markdown.split("\n");
    const distribution: { name: string; words: number }[] = [];

    for (let i = 0; i < Math.min(6, headings.length); i++) {
      const current = headings[i];
      const next = headings[i + 1];
      const startLine = current.lineNo;
      const endLine = next ? next.lineNo : lines.length;

      const sectionText = lines.slice(startLine, endLine).join(" ");
      const sectionWords = sectionText.split(/\s+/).filter(w => w.length > 0).length;

      distribution.push({
        name: current.text.length > 15 ? `${current.text.substring(0, 15)}...` : current.text,
        words: sectionWords
      });
    }

    return distribution;
  }, [headings, stats, markdown, linksList]);

  // Extract structured object if present
  const structuredData = useMemo(() => {
    // Check various schema payloads
    if (scrapeData?.extract) return scrapeData.extract;
    if (payload?.responseData?.extract) return payload.responseData.extract;
    if (payload?.extract) return payload.extract;
    
    // If we passed option "extract" standard output returns in responseData.data (which is scrapeData)
    // Check if any fields other than markdown/html/metadata exist in scrapeData
    const standardKeys = ["markdown", "html", "rawHtml", "metadata", "links", "screenshot", "success"];
    const extraKeys = Object.keys(scrapeData || {}).filter(k => !standardKeys.includes(k));
    
    if (extraKeys.length > 0) {
      const extracted: Record<string, any> = {};
      extraKeys.forEach(k => {
        extracted[k] = scrapeData[k];
      });
      return extracted;
    }
    return null;
  }, [scrapeData, payload]);

  // Compute Link Distribution
  const linkPieData = useMemo(() => {
    const extCount = linksList.filter(l => l.isExternal).length;
    const intCount = linksList.length - extCount;
    return [
      { name: "Internal", value: intCount || 1, color: "#3b82f6" },
      { name: "External", value: extCount || 1, color: "#1d4ed8" }
    ];
  }, [linksList]);

  return (
    <div id="scrape-visualizer-root" className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-xs overflow-x-auto gap-1">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "dashboard"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard Stats
        </button>
        <button
          onClick={() => setActiveTab("markdown")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "markdown"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          Markdown Output
        </button>
        <button
          onClick={() => setActiveTab("outline")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "outline"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Layers className="w-4 h-4" />
          Headings Outline ({headings.length})
        </button>
        <button
          onClick={() => setActiveTab("links")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "links"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Link2 className="w-4 h-4" />
          Links Map ({linksList.length})
        </button>
        {structuredData && (
          <button
            onClick={() => setActiveTab("structured")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "structured"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-4 h-4 animate-bounce" />
            AI Extracted Data
          </button>
        )}
        <button
          onClick={() => setActiveTab("metadata")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "metadata"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Info className="w-4 h-4" />
          Metadata
        </button>
      </div>

      {/* Tab Panels */}
      <div className="min-h-[400px]">
        {/* TAB 1: DASHBOARD STATS */}
        {activeTab === "dashboard" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Grid of KPI Indicators */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Word Count</span>
                  <span className="text-xl font-extrabold text-slate-900">{stats.words.toLocaleString()}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Est. Read Time</span>
                  <span className="text-xl font-extrabold text-slate-900">{stats.readingTime} min</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Total Images</span>
                  <span className="text-xl font-extrabold text-slate-900">{stats.mediaCount}</span>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
                <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Extracted Links</span>
                  <span className="text-xl font-extrabold text-slate-900">{linksList.length}</span>
                </div>
              </div>
            </div>

            {/* Visualizer Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs lg:col-span-2 space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Content Distribution (Words per Section)
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
                      <Tooltip 
                        contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e2e8f0" }} 
                        formatter={(value) => [`${value} words`, "Words"]}
                      />
                      <Bar dataKey="words" fill="#2563eb" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#2563eb" : "#1d4ed8"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-blue-600" />
                  Link Origin Distribution
                </h3>
                <div className="h-48 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={linkPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {linkPieData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} Links`, "Count"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 pt-2">
                  {linkPieData.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span>{entry.name} ({entry.value === 1 && linksList.length === 0 ? 0 : entry.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Metrics list */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Payload Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 font-mono text-xs">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Character Length</span>
                  <span className="text-slate-800 font-semibold">{stats.characters.toLocaleString()} chars</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Total Lines</span>
                  <span className="text-slate-800 font-semibold">{stats.lines.toLocaleString()} lines</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Heading Tags</span>
                  <span className="text-slate-800 font-semibold">{stats.headingCount} headings</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-slate-400 block mb-1">HTML Size (Est)</span>
                  <span className="text-slate-800 font-semibold">{(rawHtml.length / 1024).toFixed(1)} KB</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Source URL Host</span>
                  <span className="text-slate-800 font-semibold truncate block" title={url}>
                    {(() => {
                      try { return new URL(url).hostname; } catch(e) { return url; }
                    })()}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <span className="text-slate-400 block mb-1">Scraped At</span>
                  <span className="text-slate-800 font-semibold truncate block">
                    {payload.timestamp ? new Date(payload.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MARKDOWN VIEWER */}
        {activeTab === "markdown" && (
          <div className="animate-fadeIn">
            <MarkdownViewer markdown={markdown} url={url} />
          </div>
        )}

        {/* TAB 3: DOCUMENT STRUCTURE (HEADINGS OUTLINE) */}
        {activeTab === "outline" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4 animate-fadeIn">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Headings Tree Structure</h3>
              <p className="text-xs text-slate-500">Document architectural layout compiled from headings tags.</p>
            </div>

            {headings.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg text-slate-400 text-xs italic">
                No structural headings (H1-H6) found in document markdown.
              </div>
            ) : (
              <div className="border border-slate-100 rounded-lg overflow-hidden bg-slate-50/50 p-4 max-h-[500px] overflow-y-auto">
                <div className="space-y-2.5">
                  {headings.map((h, i) => (
                    <div 
                      key={i} 
                      className="flex items-center gap-2 text-xs"
                      style={{ paddingLeft: `${(h.level - 1) * 20}px` }}
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className={`inline-block font-mono text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                        h.level === 1 ? "bg-blue-100 text-blue-800" :
                        h.level === 2 ? "bg-slate-100 text-slate-800" :
                        "bg-slate-200 text-slate-700"
                      }`}>
                        H{h.level}
                      </span>
                      <span className={`truncate text-slate-800 ${h.level === 1 ? "font-bold" : h.level === 2 ? "font-semibold" : ""}`}>
                        {h.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: HYPERLINK DISTRIBUTION MAP */}
        {activeTab === "links" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4 animate-fadeIn">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Extracted Links Catalog</h3>
                <p className="text-xs text-slate-500">Full layout mapping of active links embedded in page.</p>
              </div>

              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter links..."
                  value={linksFilter}
                  onChange={(e) => setLinksFilter(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {filteredLinks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg text-slate-400 text-xs italic">
                {linksList.length === 0 ? "No links found in the content." : "No links matching your filter."}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-[500px] overflow-y-auto shadow-inner">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="p-3">Anchor Description</th>
                      <th className="p-3">Target Address (URL)</th>
                      <th className="p-3 w-24 text-center">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredLinks.map((link, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-medium text-slate-900 max-w-[200px] truncate" title={link.text}>
                          {link.text || <span className="text-slate-300 italic">No Anchor Text</span>}
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-500 hover:text-blue-600 transition-colors max-w-[250px] truncate" title={link.href}>
                          <a href={link.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                            {link.href}
                            <ExternalLink className="w-2.5 h-2.5 inline" />
                          </a>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase ${
                            link.isExternal ? "bg-slate-100 text-slate-700 border border-slate-200" : "bg-blue-50 text-blue-700 border border-blue-100"
                          }`}>
                            {link.isExternal ? "External" : "Internal"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AI EXTRACTED STRUCTURED DATA */}
        {activeTab === "structured" && structuredData && (
          <div className="space-y-6 animate-fadeIn">
            {/* Bento Grid Spec Card representing schema parameters humanely */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6 shadow-xs relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 opacity-10">
                <Sparkles className="w-48 h-48" />
              </div>
              <div className="relative space-y-1.5">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  AI Structured Spec Sheet
                </h3>
                <p className="text-xs text-blue-100 leading-normal max-w-xl">
                  This data was extracted and formatted directly into structural parameters by Firecrawl using LLM capability.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custom specs visualizer cards */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">Properties Map</h4>
                
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {Object.entries(structuredData).map(([key, value]) => {
                    if (key === "success" || (typeof value === "object" && value === null)) return null;
                    
                    return (
                      <div key={key} className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-1 hover:border-blue-200/50 transition-colors">
                        <span className="text-[10px] uppercase font-bold text-blue-600 font-mono tracking-wider">{key}</span>
                        <div className="text-xs text-slate-800 font-semibold leading-relaxed">
                          {Array.isArray(value) ? (
                            <ul className="list-disc list-inside space-y-1 pl-1">
                              {value.map((item, idx) => (
                                <li key={idx} className="text-slate-700">{String(item)}</li>
                              ))}
                            </ul>
                          ) : typeof value === "boolean" ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase ${
                              value ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}>
                              {value ? <Check className="w-3 h-3" /> : ""}
                              {String(value)}
                            </span>
                          ) : (
                            String(value)
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Raw structured json viewer */}
              <div className="bg-slate-950 text-emerald-400 rounded-xl p-5 border border-slate-900 shadow-inner font-mono text-xs flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                    <span className="text-slate-500 text-xs font-bold font-sans uppercase">Raw Structured JSON</span>
                    <span className="text-[9px] text-emerald-600 bg-emerald-950 px-2 py-0.5 rounded-full uppercase font-bold">Valid</span>
                  </div>
                  <pre className="overflow-x-auto leading-relaxed max-h-[350px] overflow-y-auto select-text text-left">
                    {JSON.stringify(structuredData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: GLOBAL METADATA */}
        {activeTab === "metadata" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6 animate-fadeIn">
            <div>
              <h3 className="text-sm font-bold text-slate-900">SEO & Core Site Metadata</h3>
              <p className="text-xs text-slate-500">Global headers and meta tags parsed from HTML headers.</p>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
              <div className="divide-y divide-slate-100 text-xs">
                {Object.entries(metadata).map(([key, value]) => {
                  if (key === "links" || typeof value === "object") return null;

                  return (
                    <div key={key} className="flex flex-col sm:flex-row p-4 gap-2 hover:bg-slate-50/50 transition-colors">
                      <div className="sm:w-1/4 font-mono font-bold text-blue-600 uppercase tracking-wider text-[10px] py-0.5">
                        {key}
                      </div>
                      <div className="sm:w-3/4 text-slate-800 font-medium leading-relaxed break-all select-text">
                        {String(value)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

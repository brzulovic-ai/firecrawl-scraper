import React from "react";
import { History, Trash2, Layers, FileText, Calendar, ExternalLink, RefreshCw } from "lucide-react";
import { SavedFile } from "../types";

interface SidebarHistoryProps {
  files: SavedFile[];
  onSelectFile: (file: SavedFile) => void;
  onDeleteFile: (id: string) => Promise<void>;
  selectedFileId: string | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export function SidebarHistory({
  files,
  onSelectFile,
  onDeleteFile,
  selectedFileId,
  onRefresh,
  isLoading
}: SidebarHistoryProps) {
  
  const getDomain = (urlStr: string) => {
    try {
      return new URL(urlStr).hostname;
    } catch (e) {
      return urlStr;
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <div id="sidebar-history-root" className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col h-[600px] overflow-hidden">
      {/* Sidebar Header */}
      <div className="bg-slate-50 border-b border-slate-100 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Scrape Archive</h2>
          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {files.length}
          </span>
        </div>
        
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-slate-500 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
          title="Refresh Archive list"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
        {files.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic flex flex-col items-center justify-center h-full gap-2">
            <History className="w-8 h-8 text-slate-300 stroke-1" />
            <span>No files archived. Run a scrape or crawl to save data locally.</span>
          </div>
        ) : (
          files.map((file) => {
            const isSelected = selectedFileId === file.id;
            return (
              <div
                key={file.id}
                className={`flex items-start justify-between p-3.5 group transition-all select-none hover:bg-slate-50/50 cursor-pointer ${
                  isSelected ? "bg-blue-50/60 border-l-4 border-blue-600 pl-2.5" : ""
                }`}
                onClick={() => onSelectFile(file)}
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {file.mode === "crawl" ? (
                      <span className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-800 border border-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                        <Layers className="w-2.5 h-2.5" />
                        Crawl
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-800 border border-blue-100 text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                        <FileText className="w-2.5 h-2.5" />
                        Scrape
                      </span>
                    )}

                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5 font-medium">
                      <Calendar className="w-2.5 h-2.5" />
                      {formatDate(file.timestamp)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-slate-900 truncate pr-2 leading-snug">
                      {file.title || getDomain(file.url)}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-mono truncate flex items-center gap-0.5 pr-2">
                      <ExternalLink className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                      {getDomain(file.url)}
                    </p>
                  </div>

                  {file.mode === "crawl" && (
                    <div className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-sm inline-block">
                      {file.pagesCount} Pages Extracted
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Remove this scrape archive (${getDomain(file.url)})?`)) {
                      onDeleteFile(file.id);
                    }
                  }}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                  title="Delete archive from disk"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

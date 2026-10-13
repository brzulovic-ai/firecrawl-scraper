import React, { useState } from "react";
import { Eye, Code, Copy, Check, Download } from "lucide-react";

interface MarkdownViewerProps {
  markdown: string;
  url: string;
}

export function MarkdownViewer({ markdown, url }: MarkdownViewerProps) {
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const fileUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = `scrape_${url.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(fileUrl);
  };

  // Safe and responsive simple Markdown renderer
  const renderMarkdown = (text: string) => {
    if (!text) return <p className="text-gray-400 italic">No markdown content available.</p>;

    const lines = text.split("\n");
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let listOpen = false;

    return lines.map((line, idx) => {
      // Code Block Toggles
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const content = codeBlockContent.join("\n");
          codeBlockContent = [];
          return (
            <pre key={idx} className="bg-gray-900 text-gray-100 p-4 rounded-lg my-3 overflow-x-auto font-mono text-xs border border-gray-800 leading-relaxed shadow-inner">
              <code>{content}</code>
            </pre>
          );
        } else {
          inCodeBlock = true;
          return null;
        }
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        return null;
      }

      // Headings
      if (line.startsWith("# ")) {
        return <h1 key={idx} className="text-3xl font-bold text-gray-900 border-b border-gray-200 pb-2 mt-6 mb-4 leading-tight">{parseInline(line.substring(2))}</h1>;
      }
      if (line.startsWith("## ")) {
        return <h2 key={idx} className="text-2xl font-semibold text-gray-800 mt-6 mb-3 pb-1 border-b border-gray-100">{parseInline(line.substring(3))}</h2>;
      }
      if (line.startsWith("### ")) {
        return <h3 key={idx} className="text-xl font-medium text-gray-800 mt-5 mb-2">{parseInline(line.substring(4))}</h3>;
      }
      if (line.startsWith("#### ")) {
        return <h4 key={idx} className="text-lg font-medium text-gray-700 mt-4 mb-2">{parseInline(line.substring(5))}</h4>;
      }

      // Blockquotes
      if (line.startsWith("> ")) {
        return (
          <blockquote key={idx} className="border-l-4 border-blue-500 bg-blue-50/50 px-4 py-2 my-3 rounded-r italic text-slate-700">
            {parseInline(line.substring(2))}
          </blockquote>
        );
      }

      // Lists
      const isListItem = line.trim().startsWith("- ") || line.trim().startsWith("* ") || /^\d+\.\s/.test(line.trim());
      if (isListItem) {
        const cleaned = line.trim().replace(/^[-*]\s|^\d+\.\s/, "");
        return (
          <div key={idx} className="flex items-start my-1 pl-4">
            <span className="text-blue-500 mr-2 mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0"></span>
            <span className="text-slate-700 text-sm leading-relaxed">{parseInline(cleaned)}</span>
          </div>
        );
      }

      // Empty Lines
      if (line.trim() === "") {
        return <div key={idx} className="h-2"></div>;
      }

      // Horizontal Rule
      if (line.trim() === "---" || line.trim() === "***" || line.trim() === "___") {
        return <hr key={idx} className="my-6 border-t border-gray-200" />;
      }

      // Standard Paragraph
      return (
        <p key={idx} className="text-gray-700 text-sm leading-relaxed my-2">
          {parseInline(line)}
        </p>
      );
    });
  };

  // Helper to parse bold, italic, inline code and links
  const parseInline = (text: string): React.ReactNode[] => {
    // Regex matches for markdown constructs
    let parts: { type: "text" | "bold" | "italic" | "code" | "link"; content: string; extra?: string }[] = [{ type: "text", content: text }];

    // Parse Bold: **text**
    parts = parts.flatMap((part) => {
      if (part.type !== "text") return part;
      const subparts: typeof parts = [];
      const regex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(part.content)) !== null) {
        if (match.index > lastIndex) {
          subparts.push({ type: "text", content: part.content.substring(lastIndex, match.index) });
        }
        subparts.push({ type: "bold", content: match[1] });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < part.content.length) {
        subparts.push({ type: "text", content: part.content.substring(lastIndex) });
      }
      return subparts;
    });

    // Parse Inline Code: `code`
    parts = parts.flatMap((part) => {
      if (part.type !== "text") return part;
      const subparts: typeof parts = [];
      const regex = /`(.*?)`/g;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(part.content)) !== null) {
        if (match.index > lastIndex) {
          subparts.push({ type: "text", content: part.content.substring(lastIndex, match.index) });
        }
        subparts.push({ type: "code", content: match[1] });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < part.content.length) {
        subparts.push({ type: "text", content: part.content.substring(lastIndex) });
      }
      return subparts;
    });

    // Parse Links: [text](url)
    parts = parts.flatMap((part) => {
      if (part.type !== "text") return part;
      const subparts: typeof parts = [];
      const regex = /\[(.*?)\]\((.*?)\)/g;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(part.content)) !== null) {
        if (match.index > lastIndex) {
          subparts.push({ type: "text", content: part.content.substring(lastIndex, match.index) });
        }
        subparts.push({ type: "link", content: match[1], extra: match[2] });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < part.content.length) {
        subparts.push({ type: "text", content: part.content.substring(lastIndex) });
      }
      return subparts;
    });

    return parts.map((part, index) => {
      switch (part.type) {
        case "bold":
          return <strong key={index} className="font-semibold text-slate-950">{part.content}</strong>;
        case "italic":
          return <em key={index} className="italic text-slate-800">{part.content}</em>;
        case "code":
          return <code key={index} className="bg-slate-100 text-blue-700 px-1.5 py-0.5 rounded font-mono text-xs border border-slate-200">{part.content}</code>;
        case "link":
          return (
            <a key={index} href={part.extra} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-0.5 font-medium">
              {part.content}
            </a>
          );
        default:
          return <span key={index}>{part.content}</span>;
      }
    });
  };

  return (
    <div id="markdown-viewer-root" className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Viewer Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === "preview"
                ? "bg-blue-100 text-blue-800 shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Formatted Preview
          </button>
          <button
            onClick={() => setViewMode("raw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === "raw"
                ? "bg-blue-100 text-blue-800 shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Raw Markdown
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-all font-semibold border border-slate-200 bg-white"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-all font-semibold border border-slate-200 bg-white"
            title="Download as .md file"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Viewer Body */}
      <div className="flex-1 overflow-y-auto p-6 max-h-[600px]">
        {viewMode === "preview" ? (
          <div className="prose prose-sm max-w-none text-slate-800 font-sans leading-relaxed selection:bg-blue-100 selection:text-blue-900">
            {renderMarkdown(markdown)}
          </div>
        ) : (
          <div className="font-mono text-xs text-gray-300 bg-gray-950 p-4 rounded-lg overflow-x-auto select-text leading-relaxed border border-gray-900 shadow-inner h-full min-h-[300px]">
            {markdown.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="w-10 inline-block text-gray-600 select-none text-right pr-4 border-r border-gray-800 mr-4">
                  {i + 1}
                </span>
                <span className="text-gray-200 whitespace-pre-wrap">{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

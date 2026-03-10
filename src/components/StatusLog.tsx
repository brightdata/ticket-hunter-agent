"use client";

import { useEffect, useRef } from "react";
import type { SearchStatusEntry } from "@/lib/types";

interface StatusLogProps {
  entries: SearchStatusEntry[];
  isLoading?: boolean;
}

type LogType = "info" | "api" | "warn" | "done" | "action" | "error" | "step";

function classifyEntry(message: string): LogType {
  const m = message.toLowerCase();
  if (m.includes("error") || m.includes("failed") || m.includes("missing")) return "error";
  if (m.includes("done") || m.includes("complet") || m.includes("found") || m.includes("success")) return "done";
  if (m.includes("step")) return "step";
  if (m.includes("navigat") || m.includes("click") || m.includes("scroll") || m.includes("type")) return "action";
  if (m.includes("connect") || m.includes("browser") || m.includes("cdp") || m.includes("serp") || m.includes("search")) return "api";
  if (m.includes("warn") || m.includes("retry") || m.includes("timeout")) return "warn";
  return "info";
}

const PREFIX_STYLES: Record<LogType, string> = {
  info:   "text-blue-400",
  api:    "text-purple-400",
  warn:   "text-amber-400",
  done:   "text-green-400",
  action: "text-cyan-400",
  error:  "text-red-400",
  step:   "text-[#3D7FFC]",
};

const PREFIX_LABELS: Record<LogType, string> = {
  info:   "INFO",
  api:    "API",
  warn:   "WARN",
  done:   "DONE",
  action: "ACT",
  error:  "ERR",
  step:   "STEP",
};

export function StatusLog({ entries, isLoading = false }: StatusLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900/50" style={{ height: "560px" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="flex items-center gap-2 font-medium text-white">
          Agent logs
          {isLoading && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          )}
          {!isLoading && entries.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-white/20" />
          )}
        </h3>
        <span className="font-mono text-xs text-white/40">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {entries.length === 0 ? (
          <p className="text-white/30 italic">Waiting for agent to start...</p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry, index) => {
              const type = classifyEntry(entry.message);
              return (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="flex animate-[fade-in_0.2s_ease-out]"
                >
                  <span
                    className={`w-14 flex-shrink-0 font-medium ${PREFIX_STYLES[type]}`}
                  >
                    [{PREFIX_LABELS[type]}]
                  </span>
                  <span className="text-white/70">{entry.message}</span>
                </div>
              );
            })}

            {/* Animated cursor for active step */}
            {isLoading && (
              <div className="flex items-center gap-1 text-white/30">
                <span className="w-14 flex-shrink-0" />
                <span className="animate-pulse">▊</span>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
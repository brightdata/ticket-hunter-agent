"use client";

import Image from "next/image";
import type { BrowserSession } from "@/hooks/useTicketSearch";

// ── Single browser panel ──────────────────────────────────────────────────────

interface BrowserPanelProps {
  label: string;
  session: BrowserSession | null;
  isLoading: boolean;
}

function BrowserPanel({ label, session, isLoading }: BrowserPanelProps) {
  const hasInspect = Boolean(session?.inspectUrl);
  const hasScreenshot = Boolean(session?.screenshotDataUrl);
  const isActive = hasInspect || hasScreenshot;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900/50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 flex-shrink-0">
        <h3 className="flex items-center gap-2 text-sm font-medium text-white">
          {label}
          {hasInspect && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          )}
          {isLoading && !hasInspect && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          )}
        </h3>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/50" />
        </div>
      </div>

      {/* Viewport — fills remaining space */}
      <div className="relative flex-1 min-h-0">
        {session?.inspectUrl ? (
          <iframe
            src={session.inspectUrl}
            title={`Live Browser — ${label}`}
            className="absolute inset-0 h-full w-full"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : session?.screenshotDataUrl ? (
          <Image
            src={session.screenshotDataUrl}
            alt={`${label} screenshot`}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            {isLoading && !isActive ? (
              <>
                <div className="w-full max-w-xs space-y-3 px-8">
                  <div className="h-2.5 animate-pulse rounded bg-white/5" />
                  <div className="h-2.5 w-4/5 animate-pulse rounded bg-white/5" />
                  <div className="h-2.5 w-3/5 animate-pulse rounded bg-white/5" />
                </div>
                <p className="text-xs text-white/30">Connecting...</p>
              </>
            ) : (
              <>
                <svg
                  className="h-10 w-10 text-white/10"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
                <p className="text-xs text-white/30">Waiting for session</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-panel grid ──────────────────────────────────────────────────────────

export interface BrowserViewProps {
  browserSessions: Record<string, BrowserSession>;
  isLoading: boolean;
}

export function BrowserView({ browserSessions, isLoading }: BrowserViewProps) {
  const keys = Object.keys(browserSessions);

  // While loading with no sessions yet, show a single placeholder panel
  if (keys.length === 0) {
    return (
      <div style={{ height: "560px" }}>
        <BrowserPanel
          label="Live Browser"
          session={null}
          isLoading={isLoading}
        />
      </div>
    );
  }

  // 1 session → full width; 2–3 → side by side in one row
  const gridClass =
    keys.length === 1
      ? "grid-cols-1"
      : "grid-cols-2";

  // Single large row height
  const panelHeight = "560px";

  return (
    <div className={`grid gap-4 ${gridClass}`} style={{ gridAutoRows: panelHeight }}>
      {keys.map((key, i) => (
        <div
          key={key}
          className={keys.length === 3 && i === 2 ? "col-span-2" : undefined}
          style={{ height: panelHeight }}
        >
          <BrowserPanel
            label={key === "default" ? "Live Browser" : key}
            session={browserSessions[key]}
            isLoading={isLoading}
          />
        </div>
      ))}
    </div>
  );
}
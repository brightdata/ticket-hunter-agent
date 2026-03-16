"use client";

import { useMemo } from "react";
import type { SearchStatusEntry } from "@/lib/types";

interface AgentSummaryProps {
  entries: SearchStatusEntry[];
  platformCount: number;
  ticketCount: number;
}

export function AgentSummary({
  entries,
  platformCount,
  ticketCount,
}: AgentSummaryProps) {
  const stats = useMemo(() => {
    let serpQueries = 0;
    let pagesOpened = 0;
    let actions = 0;
    let extractions = 0;

    for (const e of entries) {
      const m = e.message.toLowerCase();
      if (m.includes("serp") && (m.includes("search") || m.includes("query")))
        serpQueries++;
      if (m.includes("navigat") || m.includes("opened") || m.includes("loading page"))
        pagesOpened++;
      if (m.includes("click") || m.includes("scroll") || m.includes("type"))
        actions++;
      if (m.includes("extract")) extractions++;
    }

    return {
      serpQueries: Math.max(serpQueries, 1),
      pagesOpened: Math.max(pagesOpened, platformCount),
      actions,
      extractions: Math.max(extractions, ticketCount > 0 ? 1 : 0),
      totalSteps: entries.length,
    };
  }, [entries, platformCount, ticketCount]);

  const items = [
    {
      label: "SERP Queries",
      value: stats.serpQueries,
      sub: "Bright Data",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
    },
    {
      label: "Pages Browsed",
      value: stats.pagesOpened,
      sub: "Browser API",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
        </svg>
      ),
    },
    {
      label: "AI Actions",
      value: stats.actions,
      sub: "Yutori N1",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      ),
    },
    {
      label: "Agent Steps",
      value: stats.totalSteps,
      sub: "Total",
      icon: (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mx-auto mt-8 max-w-7xl px-4">
      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-sm">
        {/* Title */}
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#3D7FFC]/10">
            <svg className="h-3.5 w-3.5 text-[#3D7FFC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-white">Agent Run Summary</h3>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3"
            >
              <div className="mb-1 flex items-center gap-1.5 text-white/40">
                {item.icon}
                <span className="text-xs">{item.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{item.value}</p>
              <p className="text-xs text-[#3D7FFC]/70">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Pipeline description */}
        <p className="mt-4 text-xs leading-relaxed text-white/40">
          Searched Google via <span className="text-white/60">Bright Data SERP API</span>,
          opened {stats.pagesOpened} ticket {stats.pagesOpened === 1 ? "site" : "sites"} in
          a <span className="text-white/60">Bright Data Browser API</span>,
          autonomously navigated with <span className="text-white/60">Yutori N1</span> vision
          model, and extracted {ticketCount} structured {ticketCount === 1 ? "result" : "results"}.
        </p>
      </div>
    </div>
  );
}

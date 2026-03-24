"use client";

import { AgentSummary } from "@/components/AgentSummary";
import { BrowserView } from "@/components/BrowserView";
import { ResultCard } from "@/components/ResultCard";
import { SearchForm } from "@/components/SearchForm";
import { StatusLog } from "@/components/StatusLog";
import { useTicketSearch } from "@/hooks/useTicketSearch";
import { useState, useEffect } from "react";

export default function Home() {
  const {
    isLoading,
    isDisabled,
    statusEntries,
    browserSessions,
    tickets,
    error,
    finalAnswer,
    startSearch,
  } = useTicketSearch();

  const [showModal, setShowModal] = useState(false);

  // Show the modal only after the search has finished (isLoading → false)
  // so it never obscures the live agent workspace or appears before results.
  // For instant failures (e.g. 429 rate-limit), isLoading is already false
  // when the error is set, so the modal still appears immediately.
  useEffect(() => {
    if (error && !isLoading) setShowModal(true);
  }, [error, isLoading]);

  const validTickets = tickets.filter((t) => {
    const isUnknown = (v: string) => !v || v.toLowerCase() === "unknown";
    return !(isUnknown(t.eventName) && isUnknown(t.price));
  });
  const hasResults = validTickets.length > 0 || finalAnswer !== null;
  const hasActivity = isLoading || statusEntries.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      {/* ── Navigation ── */}
      <nav className="fixed left-0 right-0 top-0 z-40 border-b border-white/5 bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brightdata.svg" alt="Bright Data" className="h-8" />
            <span className="text-white/40">×</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/yutori.png" alt="Yutori" className="h-6" style={{ filter: "invert(1) brightness(2)" }} />
          </div>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="flex-1 pt-20 pb-16">
        {/* ── Hero + Search ── */}
        <section className={`px-4 text-center ${hasActivity ? "py-6" : "py-12"}`}>
          {/* Badge */}

          <h1 className={`mb-3 font-bold text-white ${hasActivity ? "text-3xl" : "text-5xl md:text-6xl"}`}>
            Ticket Hunter
          </h1>
          {!hasActivity && (
            <>
              <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-white/50">
                Type any event. This AI agent will search Google, open real browsers
                across ticket platforms, and autonomously navigate them to find you
                the best available seats&nbsp;&mdash;&nbsp;streaming every step live.
              </p>

              {/* ── Pipeline visualization ── */}
              <div className="mx-auto mb-12 max-w-2xl">
                <div className="relative grid grid-cols-4">
                  {/* Connecting line */}
                  <div className="pointer-events-none absolute top-[15px] left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-[#9D97F4]/25 via-[#3D7FFC]/25 to-emerald-400/25" />

                  {[
                    { num: "1", label: "Web Search", tech: "Bright Data SERP", color: "#9D97F4" },
                    { num: "2", label: "Open Browsers", tech: "Browser API", color: "#3D7FFC" },
                    { num: "3", label: "Navigate Pages", tech: "Yutori N1 Vision", color: "#15C1E6" },
                    { num: "4", label: "Best Tickets", tech: "Ranked results", color: "#34d399" },
                  ].map((step) => (
                    <div key={step.num} className="relative flex flex-col items-center text-center">
                      <div
                        className="mb-3 flex h-[30px] w-[30px] items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          background: `${step.color}15`,
                          border: `1px solid ${step.color}30`,
                          color: step.color,
                        }}
                      >
                        {step.num}
                      </div>
                      <p className="text-[13px] font-medium text-white/60">{step.label}</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: `${step.color}aa` }}>
                        {step.tech}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className={hasActivity ? "mb-2" : "mb-0"}>
            <SearchForm
              onSubmit={startSearch}
              isLoading={isLoading}
              isDisabled={isDisabled}
            />
          </div>
        </section>

        {/* ── Agent workspace (visible once search starts) ── */}
        {hasActivity && (
          <section className="mx-auto max-w-[1600px] px-4">
            {/* Two-column: browser (left, larger) + status log (right) */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] items-start">
              <BrowserView
                browserSessions={browserSessions}
                isLoading={isLoading}
              />
              <StatusLog entries={statusEntries} isLoading={isLoading} />
            </div>
          </section>
        )}

        {/* ── Rate-limit / error modal ── */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            {/* Card */}
            <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1b2e] p-8 shadow-2xl">
              {/* Close */}
              <button
                onClick={() => setShowModal(false)}
                className="absolute right-4 top-4 text-white/30 hover:text-white/70 transition-colors text-xl leading-none"
              >
                ✕
              </button>

              {/* Icon */}
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#3D7FFC]/30 bg-[#3D7FFC]/10">
                <span className="text-2xl">🎟️</span>
              </div>

              <h2 className="mb-2 text-2xl font-bold text-white">It&apos;s just a demo!</h2>
              <p className="mb-1 text-sm text-white/50">
                You&apos;ve hit the rate limit for this live demo.
              </p>
              <p className="mb-7 text-sm text-white/50">
                Clone the repo and run it yourself — unlimited searches, your own keys.
              </p>

              <div className="flex flex-col gap-3">
                <a
                  href="https://github.com/brightdata/ticket-hunter-agent"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#3D7FFC] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  Clone the repo
                </a>
                <a
                  href="https://docs.brightdata.com/scraping-automation/scraping-browser/introduction"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
                >
                  Learn about Bright Data
                </a>
                <a
                  href="https://docs.yutori.com/reference/n1"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
                >
                  Learn about Yutori N1
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ── Agent Summary (shown when done) ── */}
        {hasResults && !isLoading && (
          <AgentSummary
            entries={statusEntries}
            platformCount={Object.keys(browserSessions).length}
            ticketCount={validTickets.length}
          />
        )}

        {/* ── Results ── */}
        {hasResults && (
          <section className="mx-auto mt-8 max-w-7xl px-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Tickets found
                <span className="ml-2 rounded bg-[#3D7FFC]/10 px-2 py-0.5 text-sm font-normal text-[#3D7FFC]">
                  {validTickets.length}
                </span>
              </h2>
            </div>

            {validTickets.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {validTickets.map((ticket, i) => (
                  <ResultCard key={i} ticket={ticket} index={i} />
                ))}
              </div>
            ) : finalAnswer ? (
              /* Fallback: raw N1 answer when structured parsing yielded nothing */
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6 text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
                {finalAnswer}
              </div>
            ) : null}
          </section>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-6 text-center">
        <p className="text-sm text-white/40">
          Powered by{" "}
          <a
            href="https://brightdata.com"
            target="_blank"
            rel="noreferrer"
            className="text-white/60 underline hover:text-white"
          >
            Bright Data
          </a>{" "}
          &amp;{" "}
          <a
            href="https://yutori.com"
            target="_blank"
            rel="noreferrer"
            className="text-white/60 underline hover:text-white"
          >
            Yutori N1
          </a>
        </p>
      </footer>
    </div>
  );
}
"use client";

import { BrowserView } from "@/components/BrowserView";
import { ResultCard } from "@/components/ResultCard";
import { SearchForm } from "@/components/SearchForm";
import { StatusLog } from "@/components/StatusLog";
import { useTicketSearch } from "@/hooks/useTicketSearch";

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

  const hasResults = tickets.length > 0 || finalAnswer !== null;
  const hasActivity = isLoading || statusEntries.length > 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Navigation ── */}
      <nav className="fixed left-0 right-0 top-0 z-40 border-b border-white/5 bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">bright</span>
            <span className="font-bold text-[#3D7FFC]">data</span>
            <span className="mx-1 text-white/40">×</span>
            <span className="font-bold text-white">Ticket Hunter</span>
            <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs text-white/50">
              AI Agent
            </span>
          </div>
          <a
            href="https://brightdata.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[#3D7FFC]/30 bg-[#3D7FFC]/10 px-4 py-1.5 text-sm font-medium text-[#3D7FFC] transition-colors hover:bg-[#3D7FFC]/20"
          >
            Bright Data
          </a>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="flex-1 pt-20 pb-16">
        {/* ── Hero + Search ── */}
        <section className={`px-4 text-center ${hasActivity ? "py-6" : "py-12"}`}>
          {/* Badge */}
          {!hasActivity && (
            <span className="mb-6 inline-block rounded-full border border-[#3D7FFC]/30 bg-gradient-to-r from-[#9D97F4]/20 via-[#3D7FFC]/20 to-[#15C1E6]/20 px-4 py-1.5 text-sm font-medium text-[#3D7FFC]">
              Powered by Bright Data &amp; Yutori N1
            </span>
          )}

          <h1 className={`mb-3 font-bold text-white ${hasActivity ? "text-3xl" : "text-5xl md:text-6xl"}`}>
            Ticket Hunter
          </h1>
          {!hasActivity && (
            <p className="mx-auto mb-10 max-w-2xl text-lg text-white/60">
              AI agent that autonomously browses StubHub, Ticketmaster, SeatGeek
              and more to find you the best available seats — live.
            </p>
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

        {/* ── Error banner ── */}
        {error && (
          <section className="mx-auto mt-6 max-w-7xl px-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400">
              {error}
            </div>
          </section>
        )}

        {/* ── Results ── */}
        {hasResults && (
          <section className="mx-auto mt-8 max-w-7xl px-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Tickets found
                <span className="ml-2 rounded bg-[#3D7FFC]/10 px-2 py-0.5 text-sm font-normal text-[#3D7FFC]">
                  {tickets.length}
                </span>
              </h2>
            </div>

            {tickets.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {tickets.map((ticket, i) => (
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
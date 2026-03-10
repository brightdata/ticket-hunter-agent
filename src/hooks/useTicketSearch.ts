"use client";

import { useCallback, useRef, useState } from "react";
import type { SearchStatusEntry, TicketResult } from "@/lib/types";

export interface BrowserSession {
  inspectUrl: string | null;
  screenshotDataUrl: string | null;
}

export interface TicketSearchState {
  isLoading: boolean;
  isDisabled: boolean;
  statusEntries: SearchStatusEntry[];
  /** Keyed by source/platform name (e.g. "StubHub"). Falls back to "default". */
  browserSessions: Record<string, BrowserSession>;
  tickets: TicketResult[];
  finalAnswer: string | null;
  error: string | null;
}

export interface TicketSearchHook extends TicketSearchState {
  startSearch: (query: string) => void;
}

type SseEvent =
  | { type: "status"; message: string; source?: string }
  | { type: "inspect_url"; url: string; source?: string }
  | { type: "screenshot"; data: string; source?: string }
  | { type: "result"; tickets: TicketResult[]; finalAnswer: string | null }
  | { type: "error"; message: string }
  | { type: "done" };

const INITIAL_STATE: TicketSearchState = {
  isLoading: false,
  isDisabled: false,
  statusEntries: [],
  browserSessions: {},
  tickets: [],
  finalAnswer: null,
  error: null,
};

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

function sessionKey(source: string | undefined): string {
  return source?.trim() || "default";
}

export function useTicketSearch(): TicketSearchHook {
  const [state, setState] = useState<TicketSearchState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const startSearch = useCallback((query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ ...INITIAL_STATE, isLoading: true });

    void (async () => {
      const addStatus = (message: string) =>
        setState((prev) => ({
          ...prev,
          statusEntries: [
            ...prev.statusEntries,
            { timestamp: timestamp(), message },
          ],
        }));

      const updateSession = (
        source: string | undefined,
        patch: Partial<BrowserSession>,
      ) => {
        const key = sessionKey(source);
        setState((prev) => ({
          ...prev,
          browserSessions: {
            ...prev.browserSessions,
            [key]: {
              inspectUrl: prev.browserSessions[key]?.inspectUrl ?? null,
              screenshotDataUrl:
                prev.browserSessions[key]?.screenshotDataUrl ?? null,
              ...patch,
            },
          },
        }));
      };

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          const msg = data.error ?? "Search failed.";
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isDisabled: res.status === 429,
            error: msg,
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const dispatchEvent = (event: SseEvent) => {
          switch (event.type) {
            case "status":
              addStatus(event.message);
              break;
            case "inspect_url":
              updateSession(event.source, { inspectUrl: event.url });
              break;
            case "screenshot":
              updateSession(event.source, { screenshotDataUrl: event.data });
              break;
            case "result":
              setState((prev) => ({
                ...prev,
                tickets: event.tickets,
                finalAnswer: event.finalAnswer,
              }));
              break;
            case "error":
              addStatus(`Error: ${event.message}`);
              setState((prev) => ({ ...prev, error: event.message }));
              break;
            case "done":
              setState((prev) => ({ ...prev, isLoading: false }));
              break;
          }
        };

        const processChunk = (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              dispatchEvent(JSON.parse(line.slice(6)) as SseEvent);
            } catch {
              // malformed line — skip
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          processChunk(decoder.decode(value, { stream: true }));
        }

        setState((prev) =>
          prev.isLoading ? { ...prev, isLoading: false } : prev,
        );
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Network error.";
        setState((prev) => ({ ...prev, isLoading: false, error: msg }));
      }
    })();
  }, []);

  return { ...state, startSearch };
}
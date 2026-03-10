import { searchTickets } from "@/lib/bright-data";
import { emitAgentEvent } from "@/lib/agent/stream-events";
import type { AgentState } from "@/lib/agent/state";

const DIRECT_EVENT_PATTERNS = [
  "/event/",
  "/events/",
  "/tickets/",
  "/listing/",
  "/buy/",
  "eventid=",
  "performance",
];

const NON_EVENT_PATTERNS = [
  "/search",
  "?q=",
  "/discover",
  "/explore",
  "/category/",
  "/artists/",
  "/sports/",
  "/concerts",
];

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2);
}

function scoreSelection(
  candidate: AgentState["ticketUrls"][number],
  queryTokens: string[],
): number {
  const normalized = `${candidate.title} ${candidate.url}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (normalized.includes(token)) {
      score += 5;
    }
  }

  if (DIRECT_EVENT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    score += 20;
  }

  if (NON_EVENT_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    score -= 15;
  }

  if (normalized.includes("ticket")) {
    score += 6;
  }

  return score;
}

function pickBestTicketUrl(
  candidates: AgentState["ticketUrls"],
  query: string,
): AgentState["ticketUrls"][number] | null {
  if (candidates.length === 0) {
    return null;
  }

  const queryTokens = tokenizeQuery(query);

  return [...candidates].sort(
    (a, b) => scoreSelection(b, queryTokens) - scoreSelection(a, queryTokens),
  )[0];
}

export async function serpSearchNode(state: AgentState): Promise<AgentState> {
  const trimmedQuery = state.query.trim();
  emitAgentEvent({
    type: "status",
    message: "Searching ticket sources via SERP...",
  });

  if (!trimmedQuery) {
    emitAgentEvent({
      type: "error",
      message: "Query is required before SERP search.",
    });
    return {
      ...state,
      ticketUrls: [],
      selectedUrl: "",
      status: "Missing search query.",
      error: "Query is required before SERP search.",
    };
  }

  const searchQuery = `${trimmedQuery} tickets buy`;
  const ticketUrls = await searchTickets(searchQuery);
  const selected = pickBestTicketUrl(ticketUrls, trimmedQuery);

  if (!selected) {
    emitAgentEvent({
      type: "status",
      message: "No ticket sources found.",
    });
    emitAgentEvent({
      type: "error",
      message: "No ticket sources found from SERP results.",
    });
    return {
      ...state,
      ticketUrls: [],
      selectedUrl: "",
      status: "No ticket sources found.",
      error: "No ticket sources found from SERP results.",
    };
  }

  const status = `Found ${ticketUrls.length} ticket sources, navigating to ${selected.platform}...`;
  emitAgentEvent({ type: "status", message: status });

  return {
    ...state,
    ticketUrls,
    selectedUrl: selected.url,
    status,
    error: null,
  };
}

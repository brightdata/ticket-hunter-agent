import type { AgentState, AgentStateUpdate } from "@/lib/agent/state";
import type { TicketResult } from "@/lib/types";

function dedupeTickets(tickets: TicketResult[]): TicketResult[] {
  const seen = new Set<string>();
  const unique: TicketResult[] = [];

  for (const ticket of tickets) {
    const key = [
      ticket.platform.trim().toLowerCase(),
      ticket.section.trim().toLowerCase(),
      ticket.row.trim().toLowerCase(),
      ticket.seats.trim().toLowerCase(),
      ticket.price.trim().toLowerCase(),
      ticket.url.trim().toLowerCase(),
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(ticket);
  }

  return unique;
}

function parsePriceValue(price: string): number {
  const sanitized = price.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function rankTickets(tickets: TicketResult[]): TicketResult[] {
  return [...tickets].sort((a, b) => parsePriceValue(a.price) - parsePriceValue(b.price));
}

export async function mergeAndRankNode(
  state: AgentState,
): Promise<AgentStateUpdate> {
  const deduped = dedupeTickets(state.tickets);
  const ranked = rankTickets(deduped);
  const platformCount = new Set(ranked.map((ticket) => ticket.platform)).size;
  const status =
    ranked.length > 0
      ? `Found ${ranked.length} unique tickets across ${platformCount} platforms.`
      : "No tickets found across all sources.";

  return {
    tickets: ranked,
    status,
    statusLog: [status],
    error: null,
  };
}

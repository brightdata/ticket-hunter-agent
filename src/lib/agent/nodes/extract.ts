import { emitAgentEvent } from "@/lib/agent/stream-events";
import type { AgentState } from "@/lib/agent/state";
import { extractTicketsWithOpenRouter } from "@/lib/openrouter-client";
import type { TicketResult } from "@/lib/types";

function getFallbackPlatform(state: AgentState): string {
  const fromSelected = state.ticketUrls.find((item) => item.url === state.selectedUrl);
  if (fromSelected?.platform) {
    return fromSelected.platform;
  }

  return state.ticketUrls[0]?.platform ?? "Unknown";
}

function buildFallbackResult(state: AgentState): TicketResult {
  return {
    eventName: "Unknown",
    eventDate: "Unknown",
    venue: "Unknown",
    city: "Unknown",
    ticketType: "Other",
    section: "Unknown",
    row: "Unknown",
    seats: "Unknown",
    quantity: "Unknown",
    price: "Unknown",
    currency: "USD",
    platform: getFallbackPlatform(state),
    url: state.selectedUrl || state.currentUrl || "",
    notes: state.finalAnswer ?? "No final answer available.",
  };
}

export async function extractNode(state: AgentState): Promise<AgentState> {
  emitAgentEvent({
    type: "status",
    message: "Extracting structured ticket results...",
  });

  const finalAnswer = state.finalAnswer?.trim();
  if (!finalAnswer) {
    emitAgentEvent({
      type: "status",
      message: "No final answer to extract; using fallback ticket result.",
    });
    return {
      ...state,
      tickets: [buildFallbackResult(state)],
      status: "No final answer to extract; using fallback ticket result.",
      error: null,
    };
  }

  const fallbackPlatform = getFallbackPlatform(state);
  const fallbackUrl = state.selectedUrl || state.currentUrl || "";

  try {
    const tickets = await extractTicketsWithOpenRouter({
      query: state.query,
      finalAnswer,
      selectedUrl: fallbackUrl,
      fallbackPlatform,
    });

    if (tickets.length > 0) {
      emitAgentEvent({
        type: "status",
        message: `Extracted ${tickets.length} ticket results.`,
      });
      return {
        ...state,
        tickets,
        status: `Extracted ${tickets.length} ticket results.`,
        error: null,
      };
    }

    console.warn(
      "[extract] OpenRouter returned no structured tickets; using fallback result.",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown OpenRouter error";
    console.warn(
      `[extract] OpenRouter structured extraction failed: ${message}`,
    );
  }

  const fallback = {
    ...buildFallbackResult(state),
    platform: fallbackPlatform,
    url: fallbackUrl,
    notes: finalAnswer,
  };

  emitAgentEvent({
    type: "status",
    message: "Structured extraction failed; returned raw final answer.",
  });

  return {
    ...state,
    tickets: [fallback],
    status: "Structured extraction failed; returned raw final answer.",
    error: null,
  };
}

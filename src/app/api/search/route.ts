import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runTicketHunterAgent } from "@/lib/agent/graph";
import { clearAgentRuntimeSession } from "@/lib/agent/runtime-session";
import {
  runWithAgentEventEmitter,
  type AgentStreamEvent,
} from "@/lib/agent/stream-events";
import { createInitialAgentState } from "@/lib/agent/state";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchRequestBody = {
  query?: unknown;
};

type SseEventPayload =
  | AgentStreamEvent
  | { type: "done" };

function getQueryFromBody(body: SearchRequestBody): string {
  return typeof body.query === "string" ? body.query.trim() : "";
}

function sendSseEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  payload: SseEventPayload,
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID().slice(0, 8);
  const logPrefix = `[api/search][${requestId}]`;
  const log = (
    level: "info" | "warn" | "error",
    message: string,
    details?: Record<string, unknown>,
  ) => {
    const detailSuffix = details ? ` ${JSON.stringify(details)}` : "";
    const line = `${logPrefix} ${message}${detailSuffix}`;

    if (level === "error") {
      console.error(line);
      return;
    }
    if (level === "warn") {
      console.warn(line);
      return;
    }
    console.log(line);
  };

  let body: SearchRequestBody;
  try {
    body = (await request.json()) as SearchRequestBody;
  } catch {
    log("warn", "Invalid JSON request body.");
    return NextResponse.json(
      { error: "Invalid JSON body. Expected: { query: string }" },
      { status: 400 },
    );
  }

  const query = getQueryFromBody(body);
  if (!query) {
    log("warn", "Rejected empty query.");
    return NextResponse.json(
      { error: "Query is required." },
      { status: 400 },
    );
  }

  if (query.length > 300) {
    log("warn", "Rejected long query.", { queryLength: query.length });
    return NextResponse.json(
      { error: "Query is too long (max 300 characters)." },
      { status: 400 },
    );
  }

  const ip = getClientIp(request);
  log("info", "Incoming search request.", { ip, query });
  try {
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.allowed) {
      log("warn", "Rate limit blocked request.", { ip });
      return NextResponse.json(
        { error: "You've already searched today. Try again in 24h." },
        { status: 429 },
      );
    }
    log("info", "Rate limit check passed.", { ip });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rate limit service unavailable.";
    log("error", "Rate limit check failed.", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const encoder = new TextEncoder();
  log("info", "Opening SSE stream.");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safelySend = (payload: SseEventPayload) => {
        if (closed) {
          return;
        }
        sendSseEvent(controller, encoder, payload);
      };

      const finish = () => {
        if (closed) {
          return;
        }
        closed = true;
        controller.close();
      };

      request.signal.addEventListener("abort", () => {
        closed = true;
        log("warn", "Client aborted request.");
      });

      void (async () => {
        let sentError = false;

        const forwardAgentEvent = (event: AgentStreamEvent) => {
          const source = event.source ?? null;
          if (event.type === "error") {
            sentError = true;
            log("warn", "Suppressed agent error (not forwarded to client).", {
              message: event.message,
              source,
            });
            return;
          }

          if (event.type === "screenshot") {
            log("info", "Agent event.", {
              type: event.type,
              source,
              dataLength: event.data.length,
            });
          } else if (event.type === "result") {
            log("info", "Agent event.", {
              type: event.type,
              source,
              ticketCount: event.tickets.length,
              hasFinalAnswer: Boolean(event.finalAnswer),
            });
          } else {
            log("info", "Agent event.", {
              ...(event as Record<string, unknown>),
              source,
            });
          }
          safelySend(event);
        };

        try {
          safelySend({ type: "status", message: "Starting ticket search..." });
          log("info", "Agent run started.");

          await clearAgentRuntimeSession();

          const initialState = createInitialAgentState(query);
          const finalState = await runWithAgentEventEmitter(
            forwardAgentEvent,
            async () => runTicketHunterAgent(initialState),
          );

          const hasTickets = finalState.tickets.length > 0;
          const hasAnswer = Boolean(finalState.finalAnswer);

          if (hasTickets || hasAnswer) {
            safelySend({
              type: "result",
              tickets: finalState.tickets,
              finalAnswer: finalState.finalAnswer,
            });
          }

          if (finalState.error) {
            log("warn", "Agent completed with error.", {
              error: finalState.error,
              stepCount: finalState.stepCount,
              hadResults: hasTickets || hasAnswer,
            });
            if (!hasTickets && !hasAnswer && !sentError) {
              safelySend({ type: "error", message: finalState.error });
            }
          } else {
            log("info", "Agent completed successfully.", {
              ticketCount: finalState.tickets.length,
              stepCount: finalState.stepCount,
              hasInspectUrl: Boolean(finalState.inspectUrl),
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unexpected agent failure.";
          log("error", "Unhandled route error.", { error: message });
        } finally {
          await clearAgentRuntimeSession();
          safelySend({ type: "done" });
          finish();
          log("info", "SSE stream closed.");
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

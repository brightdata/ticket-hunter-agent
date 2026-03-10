import { AsyncLocalStorage } from "node:async_hooks";
import type { TicketResult } from "@/lib/types";

type SourceAwareEvent = {
  source?: string;
};

export type AgentStreamEvent =
  | ({ type: "status"; message: string } & SourceAwareEvent)
  | ({ type: "inspect_url"; url: string } & SourceAwareEvent)
  | ({ type: "screenshot"; data: string } & SourceAwareEvent)
  | ({
      type: "result";
      tickets: TicketResult[];
      finalAnswer: string | null;
    } & SourceAwareEvent)
  | ({ type: "error"; message: string } & SourceAwareEvent);

type AgentEventEmitter = (event: AgentStreamEvent) => void;

const emitterStorage = new AsyncLocalStorage<AgentEventEmitter>();

export async function runWithAgentEventEmitter<T>(
  emitter: AgentEventEmitter,
  fn: () => Promise<T>,
): Promise<T> {
  return emitterStorage.run(emitter, fn);
}

export function emitAgentEvent(event: AgentStreamEvent): void {
  const emitter = emitterStorage.getStore();
  if (!emitter) {
    return;
  }

  emitter(event);
}
